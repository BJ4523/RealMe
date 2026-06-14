import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { createLipsync, getLipsyncStatus } from "@/lib/heygen/lipsync";
import { generateSpeech } from "@/lib/heygen/voice";
import { assembleMontage } from "@/lib/video/scenes";

type Db = SupabaseClient<Database>;
type Storage = Db | ReturnType<typeof createAdminClient>;

/** "Play full natural length" sentinel for keepAudio (lip-synced) scenes. */
export const FULL_MS = 600000;

export async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

/**
 * Extract a poster frame from the FINISHED reel and store it as the thumbnail —
 * a clean still of the agent in the actual video, instead of a low-res listing
 * photo. Best-effort: returns the signed thumbnail URL, or null on any failure
 * (the caller keeps whatever thumbnail it had). Grabs ~1.5s in (past any fade-in).
 */
export async function uploadThumbnailFromVideo(
  storage: Storage,
  videoBuf: Buffer,
  userId: string,
  videoId: string,
): Promise<string | null> {
  if (!ffmpegPath) return null;
  const dir = await mkdtemp(join(tmpdir(), "thumb-"));
  try {
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "thumb.jpg");
    await writeFile(inPath, videoBuf);
    await new Promise<void>((res, rej) =>
      execFile(
        ffmpegPath as string,
        ["-y", "-ss", "1.5", "-i", inPath, "-frames:v", "1", "-q:v", "3", outPath],
        { maxBuffer: 1 << 24 },
        (e) => (e ? rej(e) : res()),
      ),
    );
    const thumb = await readFile(outPath);
    const path = `${userId}/${videoId}-thumb.jpg`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, thumb, { contentType: "image/jpeg", upsert: true });
    if (up.error) return null;
    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);
    return signed?.signedUrl ?? null;
  } catch {
    return null;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type LipsyncResult =
  | { status: "processing" }
  | { status: "failed"; error: string }
  | { status: "ready"; videoUrl: string };

/**
 * The shared core of BOTH video paths (cinematic walkthrough + hype reel). Given
 * the silent cinematic_avatar clip ids and the full narration script, it drives
 * the one-pass lip-sync pipeline and returns the finished lip-synced video URL:
 *
 *   A) poll the silent clips
 *   B) stitch them into one montage, host it, TTS the script, fire ONE
 *      Lipsync-Precision job over the whole thing (persists the id to
 *      script_segments.lipsync)
 *   C) poll the lipsync → the lip-synced video URL
 *
 * Callers then do their own final pass on the returned URL (cinematic: re-host
 * as-is; hype reel: add the music bed + overlays). Self-locking via
 * processing→submitting so concurrent polls/cron don't double-fire.
 */
export async function advanceLipsync(
  supabase: Db,
  opts: {
    videoId: string;
    userId: string;
    clipIds: string[];
    fullScript: string;
    voiceId: string | null;
    /** Current lipsync id from script_segments (null until stage B fires it). */
    lipsync: string | null;
    /** Burn captions onto the output (default true). */
    captions?: boolean;
  },
): Promise<LipsyncResult> {
  const { videoId, userId, clipIds, voiceId } = opts;
  const vId = voiceId ?? DEFAULT_VOICE_ID;
  const storage = adminConfigured ? createAdminClient() : supabase;

  // STAGE A — the silent cinematic_avatar clips.
  const clipS = await Promise.all(clipIds.map(getCinematicClipStatus));
  if (clipS.some((s) => s.status === "failed")) {
    return {
      status: "failed",
      error:
        clipS.find((s) => s.status === "failed")?.error ??
        "A cinematic shot failed to render.",
    };
  }
  if (clipS.some((s) => s.status !== "completed")) return { status: "processing" };
  const clipUrls = clipS.map((s) => s.videoUrl).filter(Boolean) as string[];
  if (clipUrls.length !== clipIds.length) return { status: "processing" };

  // STAGE B — stitch the silent clips, host them, TTS, lipsync the whole montage.
  if (!opts.lipsync) {
    const { data: claimedB } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", videoId)
      .eq("status", "processing")
      .select("id");
    if (!claimedB || claimedB.length === 0) return { status: "processing" };

    const clipBufs = await Promise.all(clipUrls.map(fetchBuffer));
    const silent = await assembleMontage({
      scenes: clipBufs.map((buf) => ({
        kind: "video",
        videoBuf: buf,
        durationMs: FULL_MS,
      })),
      audio: {},
    });
    const silentPath = `${userId}/${videoId}-silent.mp4`;
    const upS = await storage.storage
      .from("video-cache")
      .upload(silentPath, silent, { contentType: "video/mp4", upsert: true });
    if (upS.error) throw new Error(`silent upload failed: ${upS.error.message}`);
    const { data: silentSigned } = await storage.storage
      .from("video-cache")
      .createSignedUrl(silentPath, 60 * 60 * 24);
    if (!silentSigned?.signedUrl) throw new Error("silent sign failed");

    const audio = await generateSpeech(opts.fullScript, vId);

    // Persist the narration so the FINAL mux can use it as the authoritative
    // voice track. The HeyGen lipsync output's own audio track is unreliable
    // (it can come back silent), which is why a reel could end up "music only".
    // Re-host the TTS bytes in our bucket so the Stage-C poll (minutes later)
    // still has a valid URL.
    let narrationUrl = audio.audioUrl;
    try {
      const narrBuf = await fetchBuffer(audio.audioUrl);
      const narrPath = `${userId}/${videoId}-narration`;
      const upN = await storage.storage
        .from("video-cache")
        .upload(narrPath, narrBuf, { contentType: "audio/mpeg", upsert: true });
      if (!upN.error) {
        const { data: ns } = await storage.storage
          .from("video-cache")
          .createSignedUrl(narrPath, 60 * 60 * 24);
        if (ns?.signedUrl) narrationUrl = ns.signedUrl;
      }
    } catch {
      /* fall back to the raw TTS url */
    }

    const { lipsyncId } = await createLipsync({
      videoUrl: silentSigned.signedUrl,
      audioUrl: audio.audioUrl,
      enableCaption: opts.captions ?? true,
    });

    // Merge lipsync id + narration url into script_segments (preserve the rest).
    const { data: row } = await supabase
      .from("videos")
      .select("script_segments")
      .eq("id", videoId)
      .maybeSingle();
    const seg = (row?.script_segments as Record<string, unknown> | null) ?? {};
    await supabase
      .from("videos")
      .update({
        status: "processing",
        script_segments: {
          ...seg,
          lipsync: lipsyncId,
          narration: narrationUrl,
        } as never,
      })
      .eq("id", videoId);
    return { status: "processing" };
  }

  // STAGE C — poll the single lipsync job.
  const ls = await getLipsyncStatus(opts.lipsync);
  if (ls.status === "failed") {
    return { status: "failed", error: ls.error ?? "Lipsync failed." };
  }
  if (ls.status !== "completed" || !ls.videoUrl) return { status: "processing" };
  return { status: "ready", videoUrl: ls.videoUrl };
}

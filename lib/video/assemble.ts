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
import { assembleMontage, sweepStaleTmp } from "@/lib/video/scenes";

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
  await sweepStaleTmp();
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

/** Re-host a (temporary) audio URL in our bucket and return a 24h signed URL. */
export async function hostAudio(
  storage: Storage,
  url: string,
  path: string,
): Promise<string> {
  try {
    const buf = await fetchBuffer(url);
    const up = await storage.storage
      .from("video-cache")
      .upload(path, buf, { contentType: "audio/mpeg", upsert: true });
    if (up.error) return url;
    const { data } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24);
    return data?.signedUrl ?? url;
  } catch {
    return url;
  }
}

/** Media duration in seconds via an ffmpeg probe (0 if unknown). */
function probeDurSec(path: string): Promise<number> {
  if (!ffmpegPath) return Promise.resolve(0);
  return new Promise((res) =>
    execFile(ffmpegPath as string, ["-i", path], (_e, _so, se) => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(se || "");
      res(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
    }),
  );
}

/**
 * Match a bookend beat's narration to the RAW clip's length WITHOUT re-encoding
 * the clip (re-encoding degrades the face so HeyGen lipsync stops detecting a
 * speaker — the whole reason the montage approach failed). We lipsync the raw
 * clip directly, so the audio must be within ~15% of the clip: pad the narration
 * with trailing silence to the clip's duration when it's shorter. Returns the
 * hosted (possibly padded) audio URL. Leaves longer audio as-is.
 */
export async function padAudioToClip(
  storage: Storage,
  clipUrl: string,
  audioUrl: string,
  path: string,
): Promise<string> {
  if (!ffmpegPath) return hostAudio(storage, audioUrl, `${path}.wav`);
  const dir = await mkdtemp(join(tmpdir(), "pad-"));
  try {
    const clipP = join(dir, "clip.mp4");
    const audP = join(dir, "a.wav");
    const outP = join(dir, "out.m4a");
    await writeFile(clipP, await fetchBuffer(clipUrl));
    await writeFile(audP, await fetchBuffer(audioUrl));
    const [dc, da] = await Promise.all([probeDurSec(clipP), probeDurSec(audP)]);
    if (!dc || !da) return hostAudio(storage, audioUrl, `${path}.wav`);
    // Bring the narration within ~15% of the clip so lipsync accepts it:
    //  • too SHORT → pad with trailing silence up to the clip length
    //  • too LONG  → speed it up (atempo, capped 2x) to ~the clip, then pad
    // Within range already → leave it.
    let filter: string | null = null;
    if (da < dc * 0.95) {
      filter = `apad=whole_dur=${dc.toFixed(3)}`;
    } else if (da > dc * 1.1) {
      const ratio = Math.min(2.0, Math.max(0.5, da / dc));
      filter = `atempo=${ratio.toFixed(3)},apad=whole_dur=${dc.toFixed(3)}`;
    }
    if (!filter) return hostAudio(storage, audioUrl, `${path}.wav`);
    await new Promise<void>((res, rej) =>
      execFile(
        ffmpegPath as string,
        ["-y", "-i", audP, "-af", filter, "-c:a", "aac", "-b:a", "192k", outP],
        { maxBuffer: 1 << 24 },
        (e) => (e ? rej(e) : res()),
      ),
    );
    const buf = await readFile(outP);
    const up = await storage.storage
      .from("video-cache")
      .upload(`${path}.m4a`, buf, { contentType: "audio/mp4", upsert: true });
    if (up.error) return hostAudio(storage, audioUrl, `${path}.wav`);
    const { data } = await storage.storage
      .from("video-cache")
      .createSignedUrl(`${path}.m4a`, 60 * 60 * 24);
    return data?.signedUrl ?? audioUrl;
  } catch {
    return hostAudio(storage, audioUrl, `${path}.wav`);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type LipsyncResult =
  | { status: "processing" }
  | { status: "failed"; error: string }
  // The finished BODY: every clip lip-synced (or VO-fallback) and stitched, all
  // audio baked in. `lipsynced` = at least one clip actually lip-synced. The caller
  // does the final pass (cinematic: re-host; hype: + music + overlays). The row is
  // left `submitting` (claimed) so the caller finishes without re-claiming.
  | { status: "ready"; videoUrl: string; lipsynced: boolean };

/**
 * Assemble the lip-synced BODY with ONE continuous voice. The full script is spoken
 * in a single TTS take (consistent pace — no per-clip speed drift), the silent
 * face-to-camera clips are stitched into a montage sized to that take, and a SINGLE
 * lipsync re-animates the speaker across the whole montage (enable_dynamic_duration
 * absorbs any residual). Falls back to the silent montage + that one voice muxed if
 * the lipsync can't find a speaker.
 *
 * State over script_segments {lipsync: string, montageUrl, montageNarration}:
 *   A) poll the silent clips
 *   B) one TTS of the whole script → stitch silent montage → fire ONE lipsync
 *   C) poll the lipsync → that's the body (or VO-over-montage fallback).
 */
export async function advanceLipsync(
  supabase: Db,
  opts: {
    videoId: string;
    userId: string;
    /** [opener, room1, …, closer] in playback order. */
    clipIds: string[];
    /** Per-clip narration, 1:1 with clipIds: [openerBeat, roomBeats…, closerBeat]. */
    beats: string[];
    voiceId: string | null;
    captions?: boolean;
    /** Single whole-montage lipsync id (null until stage B fires it). */
    lipsync: string | null;
  },
): Promise<LipsyncResult> {
  const { videoId, userId, clipIds, beats } = opts;
  const vId = opts.voiceId ?? DEFAULT_VOICE_ID;
  const storage = adminConfigured ? createAdminClient() : supabase;
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length || 1;

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

  const lastIdx = clipIds.length - 1;
  const beatFor = (i: number) =>
    (
      beats[i] ||
      (i === 0
        ? "Welcome — come take a look at this home."
        : i === lastIdx
          ? "Reach out today to come see it in person."
          : "Take a look at this space.")
    ).trim();

  // STAGE B — ONE continuous TTS of the WHOLE script; stitch the silent clips sized
  // to that take; fire ONE lipsync over the whole montage. This gives a single
  // continuous voice with consistent pace (no per-clip speed drift), and
  // enable_dynamic_duration absorbs any residual montage↔audio mismatch.
  if (!opts.lipsync) {
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", videoId)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return { status: "processing" };

    const fullScript = clipIds.map((_, i) => beatFor(i)).join("  ");
    const { audioUrl, duration: D } = await generateSpeech(fullScript, vId);
    const totalW = clipIds.reduce((n, _, i) => n + words(beatFor(i)), 0);
    const clipBufs = await Promise.all(clipUrls.map(fetchBuffer));
    const montage = await assembleMontage({
      scenes: clipBufs.map((b, i) => ({
        kind: "video" as const,
        videoBuf: b,
        durationMs: Math.max(1200, Math.round((D * words(beatFor(i))) / totalW) * 1000),
      })),
      audio: {},
    });
    const montPath = `${userId}/${videoId}-montage.mp4`;
    const mu = await storage.storage
      .from("video-cache")
      .upload(montPath, montage, { contentType: "video/mp4", upsert: true });
    if (mu.error) throw new Error(`montage upload failed: ${mu.error.message}`);
    const { data: msigned } = await storage.storage
      .from("video-cache")
      .createSignedUrl(montPath, 60 * 60 * 24);
    if (!msigned?.signedUrl) throw new Error("montage sign failed");

    const ls = await createLipsync({
      videoUrl: msigned.signedUrl,
      audioUrl,
      enableCaption: opts.captions ?? false,
    });

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
          lipsync: ls.lipsyncId,
          montageUrl: msigned.signedUrl,
          montageNarration: audioUrl,
        } as never,
      })
      .eq("id", videoId);
    return { status: "processing" };
  }

  // STAGE C — poll the single whole-montage lipsync; once done, that's the body.
  const st = await getLipsyncStatus(opts.lipsync);
  if (st.status === "processing") return { status: "processing" };

  const { data: claimedC } = await supabase
    .from("videos")
    .update({ status: "submitting" })
    .eq("id", videoId)
    .eq("status", "processing")
    .select("id");
  if (!claimedC || claimedC.length === 0) return { status: "processing" };

  const { data: row2 } = await supabase
    .from("videos")
    .select("script_segments")
    .eq("id", videoId)
    .maybeSingle();
  const seg2 =
    (row2?.script_segments as { montageUrl?: string; montageNarration?: string } | null) ?? {};

  let body: Buffer;
  if (st.status === "completed" && st.videoUrl) {
    body = await fetchBuffer(st.videoUrl);
  } else {
    // Lipsync failed (e.g. no speaker across the montage) → fall back to the silent
    // montage with the one voice muxed over it (continuous VO, just no mouth-sync).
    const mont = await fetchBuffer(seg2.montageUrl ?? clipUrls[0]);
    const narr = seg2.montageNarration
      ? await fetchBuffer(seg2.montageNarration).catch(() => null)
      : null;
    body = narr
      ? await assembleMontage({
          scenes: [{ kind: "video" as const, videoBuf: mont, durationMs: FULL_MS }],
          audio: { narration: narr },
        })
      : mont;
  }

  const bodyPath = `${userId}/${videoId}-body.mp4`;
  const up = await storage.storage
    .from("video-cache")
    .upload(bodyPath, body, { contentType: "video/mp4", upsert: true });
  if (up.error) throw new Error(`body upload failed: ${up.error.message}`);
  const { data: signed } = await storage.storage
    .from("video-cache")
    .createSignedUrl(bodyPath, 60 * 60 * 24);
  if (!signed?.signedUrl) throw new Error("body sign failed");

  return {
    status: "ready",
    videoUrl: signed.signedUrl,
    lipsynced: st.status === "completed",
  };
}

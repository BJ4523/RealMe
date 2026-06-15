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
async function hostAudio(
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

/**
 * Trim/freeze-pad a clip to ~`durSec` seconds and re-host it. HeyGen lipsync
 * rejects video/audio length mismatches over ~15%, and a raw bookend clip rarely
 * matches its beat narration — so we resize the clip to the audio before lipsync.
 */
async function matchClipToAudio(
  storage: Storage,
  clipUrl: string,
  durSec: number,
  path: string,
): Promise<string> {
  try {
    const buf = await fetchBuffer(clipUrl);
    const matched = await assembleMontage({
      scenes: [
        {
          kind: "video" as const,
          videoBuf: buf,
          durationMs: Math.max(1500, Math.round((durSec || 4) * 1000)),
        },
      ],
      audio: {},
    });
    const up = await storage.storage
      .from("video-cache")
      .upload(path, matched, { contentType: "video/mp4", upsert: true });
    if (up.error) return clipUrl;
    const { data } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24);
    return data?.signedUrl ?? clipUrl;
  } catch {
    return clipUrl;
  }
}

export type LipsyncResult =
  | { status: "processing" }
  | { status: "failed"; error: string }
  // The lip-synced/VO BODY: [opener][rooms][closer] stitched with all audio baked
  // in. `lipsynced` is true if at least one bookend actually lip-synced. Caller
  // does the final pass (cinematic: re-host; hype: + music + overlays). Status is
  // left at `submitting` (claimed) so the caller finishes without re-claiming.
  | { status: "ready"; videoUrl: string; lipsynced: boolean };

/**
 * Assemble the lip-synced BODY. HeyGen lipsync needs a detectable speaker, which
 * the room-walk clips lack (they fail "no speaker detected"), but the
 * face-to-camera OPENER and CLOSER do lip-sync. So we lipsync the two bookend
 * clips INDIVIDUALLY (each to its own beat), voice-over the room clips, then
 * stitch [opener][rooms][closer] into one body with all audio baked in.
 *
 * State machine over script_segments {lipOpener, lipCloser, roomNarration, roomPerClipMs}:
 *   A) poll the silent clips
 *   B) per-beat TTS → fire opener + closer lipsync, host the room VO, persist ids
 *   C) poll both bookend lipsyncs → stitch opener + room-VO montage + closer → body
 *
 * Per-bookend fallback: if a bookend lipsync fails (e.g. duration mismatch), that
 * clip plays silent with its voice-over instead, so the reel still completes.
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
    /** Bookend lipsync ids from script_segments (null until stage B fires them). */
    lipOpener: string | null;
    lipCloser: string | null;
  },
): Promise<LipsyncResult> {
  const { videoId, userId, clipIds, beats } = opts;
  const vId = opts.voiceId ?? DEFAULT_VOICE_ID;
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

  const last = clipIds.length - 1;
  const openerUrl = clipUrls[0];
  const closerUrl = clipUrls[last];
  const roomUrls = clipUrls.slice(1, last);
  const openerBeat =
    (beats[0] || "Welcome — come take a look at this home.").trim();
  const closerBeat =
    (beats[last] || "Reach out today to come see it in person.").trim();
  const roomBeats = beats
    .slice(1, last)
    .map((b) => (b || "").trim())
    .filter(Boolean);

  // STAGE B — TTS each beat, fire the two bookend lipsyncs, host the room VO.
  if (!opts.lipOpener) {
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", videoId)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return { status: "processing" };

    const [openerAudio, closerAudio, roomAudio] = await Promise.all([
      generateSpeech(openerBeat, vId),
      generateSpeech(closerBeat, vId),
      roomUrls.length
        ? generateSpeech(roomBeats.join(" ") || "Take a look through this home.", vId)
        : Promise.resolve(null),
    ]);

    // Resize each bookend clip to its beat audio, and host the beat audio (the
    // authoritative VO + the fallback if lipsync fails).
    const [openerMatched, closerMatched, openerNarration, closerNarration] =
      await Promise.all([
        matchClipToAudio(storage, openerUrl, openerAudio.duration, `${userId}/${videoId}-openerc.mp4`),
        matchClipToAudio(storage, closerUrl, closerAudio.duration, `${userId}/${videoId}-closerc.mp4`),
        hostAudio(storage, openerAudio.audioUrl, `${userId}/${videoId}-openera`),
        hostAudio(storage, closerAudio.audioUrl, `${userId}/${videoId}-closera`),
      ]);

    const [openerLs, closerLs] = await Promise.all([
      createLipsync({
        videoUrl: openerMatched,
        audioUrl: openerAudio.audioUrl,
        enableCaption: opts.captions ?? false,
      }),
      createLipsync({
        videoUrl: closerMatched,
        audioUrl: closerAudio.audioUrl,
        enableCaption: opts.captions ?? false,
      }),
    ]);

    let roomNarration: string | null = null;
    let roomPerClipMs = 0;
    if (roomUrls.length && roomAudio) {
      roomNarration = await hostAudio(
        storage,
        roomAudio.audioUrl,
        `${userId}/${videoId}-rooms`,
      );
      roomPerClipMs = Math.max(
        1500,
        Math.round(((roomAudio.duration || roomUrls.length * 4) / roomUrls.length) * 1000),
      );
    }

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
          lipOpener: openerLs.lipsyncId,
          lipCloser: closerLs.lipsyncId,
          openerMatched,
          closerMatched,
          openerNarration,
          closerNarration,
          roomNarration,
          roomPerClipMs,
        } as never,
      })
      .eq("id", videoId);
    return { status: "processing" };
  }

  // STAGE C — poll both bookend lipsyncs; once both resolve, stitch the body.
  const [lo, lc] = await Promise.all([
    getLipsyncStatus(opts.lipOpener),
    getLipsyncStatus(opts.lipCloser ?? opts.lipOpener),
  ]);
  if (lo.status === "processing" || lc.status === "processing") {
    return { status: "processing" };
  }
  const openerDone = lo.status === "completed" && !!lo.videoUrl;
  const closerDone = lc.status === "completed" && !!lc.videoUrl;

  // Claim the heavy stitch so concurrent polls don't double-run it. We keep the
  // `submitting` lock through to the caller's final upload (no re-claim there).
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
    (row2?.script_segments as {
      roomNarration?: string;
      roomPerClipMs?: number;
      openerMatched?: string;
      closerMatched?: string;
      openerNarration?: string;
      closerNarration?: string;
    } | null) ?? {};

  // A bookend: the lip-synced video if it completed, else the resized silent clip
  // with its VO muxed on (so it still has the agent's voice, just no mouth-sync).
  const bookend = async (
    done: boolean,
    lipUrl: string | undefined,
    rawUrl: string,
    matchedUrl: string | undefined,
    narrUrl: string | undefined,
  ): Promise<Buffer> => {
    if (done && lipUrl) return fetchBuffer(lipUrl);
    const clipBuf = await fetchBuffer(matchedUrl || rawUrl);
    const narrBuf = narrUrl ? await fetchBuffer(narrUrl).catch(() => null) : null;
    if (!narrBuf) return clipBuf;
    return assembleMontage({
      scenes: [{ kind: "video" as const, videoBuf: clipBuf, durationMs: FULL_MS }],
      audio: { narration: narrBuf },
    });
  };

  const [openerVidBuf, closerVidBuf] = await Promise.all([
    bookend(openerDone, lo.videoUrl, openerUrl, seg2.openerMatched, seg2.openerNarration),
    bookend(closerDone, lc.videoUrl, closerUrl, seg2.closerMatched, seg2.closerNarration),
  ]);

  // Room VO montage (silent room clips sized to the room narration + VO muxed).
  let roomBodyBuf: Buffer | null = null;
  if (roomUrls.length) {
    const roomBufs = await Promise.all(roomUrls.map(fetchBuffer));
    const roomNarrBuf = seg2.roomNarration
      ? await fetchBuffer(seg2.roomNarration).catch(() => null)
      : null;
    roomBodyBuf = await assembleMontage({
      scenes: roomBufs.map((b) => ({
        kind: "video" as const,
        videoBuf: b,
        durationMs: seg2.roomPerClipMs || 4000,
      })),
      audio: roomNarrBuf ? { narration: roomNarrBuf } : {},
    });
  }

  // Stitch [opener][rooms][closer] — each keeps its own baked audio.
  const bodyScenes = [
    { kind: "video" as const, videoBuf: openerVidBuf, durationMs: FULL_MS, keepAudio: true },
    ...(roomBodyBuf
      ? [{ kind: "video" as const, videoBuf: roomBodyBuf, durationMs: FULL_MS, keepAudio: true }]
      : []),
    { kind: "video" as const, videoBuf: closerVidBuf, durationMs: FULL_MS, keepAudio: true },
  ];
  const body = await assembleMontage({ scenes: bodyScenes, audio: {} });

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
    lipsynced: openerDone || closerDone,
  };
}

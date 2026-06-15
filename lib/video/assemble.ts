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
async function padAudioToClip(
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
 * Assemble the lip-synced BODY. HeyGen lipsync needs a detectable speaker, so each
 * clip is prompted face-to-camera and lip-synced INDIVIDUALLY — a single lipsync
 * over the whole montage fails "no speaker detected" because faceless frames poison
 * detection. The agent walks room-by-room talking to camera; we lipsync every clip
 * to its own beat, then stitch them into one body.
 *
 * State over script_segments {lipsyncs: string[], narrations: string[]}:
 *   A) poll the silent clips
 *   B) per clip: TTS its beat, fit the audio to the raw clip, fire one lipsync
 *   C) poll all lipsyncs → per clip use the lip-synced video (or raw clip + its VO
 *      if that one failed) → stitch into one body.
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
    /** Per-clip lipsync ids from script_segments (null until stage B fires them). */
    lipsyncs: string[] | null;
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

  // STAGE B — per clip: TTS its beat, fit the audio to the RAW clip (no clip
  // re-encode — that kills HeyGen's face detection), fire ONE lipsync per clip.
  if (!opts.lipsyncs || opts.lipsyncs.length === 0) {
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", videoId)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return { status: "processing" };

    const perClip = await Promise.all(
      clipUrls.map(async (clipUrl, i) => {
        const audio = await generateSpeech(beatFor(i), vId);
        const narration = await padAudioToClip(
          storage,
          clipUrl,
          audio.audioUrl,
          `${userId}/${videoId}-n${i}`,
        );
        const ls = await createLipsync({
          videoUrl: clipUrl,
          audioUrl: narration,
          enableCaption: opts.captions ?? false,
        });
        return { lipsync: ls.lipsyncId, narration };
      }),
    );

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
          lipsyncs: perClip.map((p) => p.lipsync),
          narrations: perClip.map((p) => p.narration),
        } as never,
      })
      .eq("id", videoId);
    return { status: "processing" };
  }

  // STAGE C — poll all lipsyncs; once all resolve, stitch the body.
  const statuses = await Promise.all(opts.lipsyncs.map(getLipsyncStatus));
  if (statuses.some((s) => s.status === "processing")) {
    return { status: "processing" };
  }

  // Claim the heavy stitch (held through the caller's final upload — no re-claim).
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
  const narrations =
    (row2?.script_segments as { narrations?: string[] } | null)?.narrations ?? [];

  // Each clip: the lip-synced video if it completed, else the raw clip with its
  // (fitted) VO muxed on — still the agent's voice on that clip, just no mouth-sync.
  const sceneBufs = await Promise.all(
    clipUrls.map(async (clipUrl, i) => {
      const st = statuses[i];
      if (st && st.status === "completed" && st.videoUrl) {
        return fetchBuffer(st.videoUrl);
      }
      const clipBuf = await fetchBuffer(clipUrl);
      const narrUrl = narrations[i];
      const narrBuf = narrUrl ? await fetchBuffer(narrUrl).catch(() => null) : null;
      if (!narrBuf) return clipBuf;
      return assembleMontage({
        scenes: [{ kind: "video" as const, videoBuf: clipBuf, durationMs: FULL_MS }],
        audio: { narration: narrBuf },
      });
    }),
  );

  const body = await assembleMontage({
    scenes: sceneBufs.map((b) => ({
      kind: "video" as const,
      videoBuf: b,
      durationMs: FULL_MS,
      keepAudio: true,
    })),
    audio: {},
  });

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
    lipsynced: statuses.some((s) => s.status === "completed"),
  };
}

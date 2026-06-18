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
import { motionForIndex } from "@/lib/video/kenburns";

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

/**
 * Slice [startSec, endSec] out of an audio buffer and re-host it (24h signed URL).
 * Used to split ONE continuous TTS take into opener/rooms/closer pieces — they're
 * consecutive cuts of the same take, so they reassemble into one seamless voice.
 */
async function sliceAudio(
  storage: Storage,
  fullBuf: Buffer,
  startSec: number,
  endSec: number,
  path: string,
): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "slice-"));
  try {
    const inP = join(dir, "full.mp3");
    const outP = join(dir, "slice.m4a");
    await writeFile(inP, fullBuf);
    await new Promise<void>((res, rej) =>
      execFile(
        ffmpegPath as string,
        ["-y", "-i", inP, "-ss", startSec.toFixed(3), "-to", Math.max(startSec + 0.1, endSec).toFixed(3), "-c:a", "aac", "-b:a", "192k", outP],
        { maxBuffer: 1 << 24 },
        (e) => (e ? rej(e) : res()),
      ),
    );
    const buf = await readFile(outP);
    const up = await storage.storage
      .from("video-cache")
      .upload(`${path}.m4a`, buf, { contentType: "audio/mp4", upsert: true });
    if (up.error) throw new Error(up.error.message);
    const { data } = await storage.storage
      .from("video-cache")
      .createSignedUrl(`${path}.m4a`, 60 * 60 * 24);
    return data?.signedUrl ?? "";
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Generate the WHOLE-script narration once (cloned voice), host it, and probe its
 * REAL spoken duration. The submit calls this BEFORE rendering the bookend clips so
 * each clip can be sized to the actual speech (voice-first) — that's the only way to
 * get lip-sync AND one continuous, un-stretched voice. Returns the hosted url + dur.
 */
export async function generateNarration(
  storage: Storage,
  fullScript: string,
  voiceId: string | null,
  path: string,
): Promise<{ audioUrl: string; dur: number }> {
  const { audioUrl, duration } = await generateSpeech(fullScript, voiceId ?? DEFAULT_VOICE_ID);
  const hosted = await hostAudio(storage, audioUrl, `${path}.wav`);
  let dur = duration || 0;
  const dir = await mkdtemp(join(tmpdir(), "narr-"));
  try {
    const p = join(dir, "a.wav");
    await writeFile(p, await fetchBuffer(hosted));
    dur = (await probeDurSec(p)) || dur;
  } catch {
    /* keep the reported duration */
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  return { audioUrl: hosted, dur };
}

/** Probe a media buffer's duration in seconds (0 on failure). */
async function probeBufDur(buf: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "pdur-"));
  try {
    const p = join(dir, "m");
    await writeFile(p, buf);
    return (await probeDurSec(p)) || 0;
  } catch {
    return 0;
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
    /** The two TWIN bookend clip ids — the talking opener + closer to lip-sync. */
    openerClip: string;
    closerClip: string;
    /** [openerBeat, roomBeats…, closerBeat] — room beats are 1:1 with roomPhotos. */
    beats: string[];
    voiceId: string | null;
    captions?: boolean;
  },
): Promise<LipsyncResult> {
  const { videoId, userId, beats } = opts;
  const vId = opts.voiceId ?? DEFAULT_VOICE_ID;
  const storage = adminConfigured ? createAdminClient() : supabase;
  const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length || 1;

  // STAGE A — the two silent TWIN bookend clips (talking opener + closer).
  const [openerS, closerS] = await Promise.all([
    getCinematicClipStatus(opts.openerClip),
    getCinematicClipStatus(opts.closerClip),
  ]);
  if (openerS.status === "failed" || closerS.status === "failed") {
    return {
      status: "failed",
      error:
        (openerS.status === "failed" ? openerS.error : closerS.error) ??
        "A bookend clip failed to render.",
    };
  }
  if (openerS.status !== "completed" || closerS.status !== "completed")
    return { status: "processing" };
  const openerUrl = openerS.videoUrl;
  const closerUrl = closerS.videoUrl;
  if (!openerUrl || !closerUrl) return { status: "processing" };

  const lastIdx = beats.length - 1;
  const openerBeat = (beats[0] || "Welcome — come take a look at this home.").trim();
  const closerBeat = (
    beats[lastIdx] || "Reach out today to come see it in person."
  ).trim();
  const roomBeats = beats.slice(1, Math.max(1, lastIdx)).map((b) => (b ?? "").trim());

  const readState = async () => {
    const { data } = await supabase
      .from("videos")
      .select("script_segments")
      .eq("id", videoId)
      .maybeSingle();
    return (
      (data?.script_segments as {
        lipOpener?: string;
        lipCloser?: string;
        openerNarration?: string;
        closerNarration?: string;
        roomNarration?: string;
        roomNarrationDur?: number;
        roomPhotos?: string[];
        ttsAudio?: string;
        ttsDur?: number;
      } | null) ?? {}
    );
  };
  const state = await readState();
  const roomPhotos = state.roomPhotos ?? [];

  // STAGE B — ONE continuous TTS sliced by word count: lip-sync the opener + closer
  // slices on the talking twin bookend clips; the middle slice is the b-roll voice.
  // The slices are consecutive cuts of the SAME take → one continuous voice.
  if (!state.lipOpener) {
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", videoId)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return { status: "processing" };

    // Voice-first: the submit already generated the whole-script narration and SIZED
    // the bookend clips to it, so here we just reuse it (no re-TTS) and slice it RAW —
    // clip ≈ slice means lipsync fits with NO atempo (one continuous, un-stretched
    // voice). Fall back to generating it for legacy rows without ttsAudio.
    let audioUrl = state.ttsAudio ?? "";
    let D = state.ttsDur ?? 0;
    if (!audioUrl || !D) {
      const fullScript = [openerBeat, ...roomBeats, closerBeat].filter(Boolean).join("  ");
      const gen = await generateNarration(storage, fullScript, vId, `${userId}/${videoId}-tts`);
      audioUrl = gen.audioUrl;
      D = gen.dur;
    }
    const fullBuf = await fetchBuffer(audioUrl);
    const wOpener = words(openerBeat);
    const wCloser = words(closerBeat);
    const wRooms = roomBeats.reduce((n, b) => n + words(b), 0);
    const W = wOpener + wRooms + wCloser || 1;
    const openerEnd = (D * wOpener) / W;
    const closerStart = (D * (wOpener + wRooms)) / W;

    const openerSlice = await sliceAudio(storage, fullBuf, 0, openerEnd, `${userId}/${videoId}-vo-open`);
    const closerSlice = await sliceAudio(storage, fullBuf, closerStart, D, `${userId}/${videoId}-vo-close`);
    const roomSlice = roomPhotos.length
      ? await sliceAudio(storage, fullBuf, openerEnd, closerStart, `${userId}/${videoId}-vo-rooms`)
      : null;

    // Pass the RAW slices (NO atempo) so the voice keeps ONE continuous speed across
    // the bookend→room seams. HeyGen's enable_dynamic_duration adjusts the CLIP to the
    // audio; short bookend lines keep the slice within ~15% of the clip. If a lipsync
    // still can't fit, the Stage-C fallback plays the raw slice as VO — still no speed
    // change (the only loss is mouth-sync on that one bookend).
    const [lo, lc] = await Promise.all([
      createLipsync({ videoUrl: openerUrl, audioUrl: openerSlice, enableCaption: opts.captions ?? false }),
      createLipsync({ videoUrl: closerUrl, audioUrl: closerSlice, enableCaption: opts.captions ?? false }),
    ]);

    const seg = (await readState()) as Record<string, unknown>;
    await supabase
      .from("videos")
      .update({
        status: "processing",
        script_segments: {
          ...seg,
          lipOpener: lo.lipsyncId,
          lipCloser: lc.lipsyncId,
          openerNarration: openerSlice,
          closerNarration: closerSlice,
          roomNarration: roomSlice,
          roomNarrationDur: closerStart - openerEnd,
        } as never,
      })
      .eq("id", videoId);
    return { status: "processing" };
  }

  // STAGE C — poll both bookend lipsyncs; stitch [twin opener][Ken-Burns rooms][twin closer].
  const [lo, lc] = await Promise.all([
    getLipsyncStatus(state.lipOpener),
    getLipsyncStatus(state.lipCloser ?? state.lipOpener),
  ]);
  if (lo.status === "processing" || lc.status === "processing") return { status: "processing" };

  const { data: claimedC } = await supabase
    .from("videos")
    .update({ status: "submitting" })
    .eq("id", videoId)
    .eq("status", "processing")
    .select("id");
  if (!claimedC || claimedC.length === 0) return { status: "processing" };
  const seg2 = await readState();

  // Bookend VIDEOS: the lip-synced output if it completed, else the raw silent clip.
  const openerVid = await fetchBuffer(
    lo.status === "completed" && lo.videoUrl ? lo.videoUrl : openerUrl,
  );
  const closerVid = await fetchBuffer(
    lc.status === "completed" && lc.videoUrl ? lc.videoUrl : closerUrl,
  );
  const photoBufs = roomPhotos.length
    ? (await Promise.all(roomPhotos.map((u) => fetchBuffer(u).catch(() => null)))).filter(
        (b): b is Buffer => !!b,
      )
    : [];

  // ONE continuous take = the EXACT audio the bookends were lip-synced to. Laying it
  // over the WHOLE stitched video as a SINGLE track removes the per-segment AAC seams
  // that cause a blip at the bookend↔b-roll joins. The b-roll is sized to fill exactly
  // (take − bookend clips) so the take's slices stay aligned with the clips (mouth-sync).
  const takeBuf = seg2.ttsAudio ? await fetchBuffer(seg2.ttsAudio).catch(() => null) : null;
  let body: Buffer;
  if (takeBuf && seg2.ttsDur) {
    let roomsBuf: Buffer | null = null;
    if (photoBufs.length) {
      const [dOpen, dClose] = await Promise.all([
        probeBufDur(openerVid),
        probeBufDur(closerVid),
      ]);
      const roomsDur = Math.max(1.5, seg2.ttsDur - dOpen - dClose);
      const perPhotoMs = Math.max(800, Math.round((roomsDur / photoBufs.length) * 1000));
      roomsBuf = await assembleMontage({
        scenes: photoBufs.map((b, i) => ({
          kind: "photo" as const,
          imageBuf: b,
          motion: motionForIndex(i),
          durationMs: perPhotoMs,
        })),
        audio: {},
      });
    }
    body = await assembleMontage({
      scenes: [openerVid, ...(roomsBuf ? [roomsBuf] : []), closerVid].map((b) => ({
        kind: "video" as const,
        videoBuf: b,
        durationMs: FULL_MS,
      })),
      audio: { narration: takeBuf },
    });
  } else {
    // Fallback (legacy rows with no stored take): per-segment baked audio.
    const withVO = async (b: Buffer, u?: string): Promise<Buffer> => {
      const n = u ? await fetchBuffer(u).catch(() => null) : null;
      return n
        ? assembleMontage({
            scenes: [{ kind: "video" as const, videoBuf: b, durationMs: FULL_MS }],
            audio: { narration: n },
          })
        : b;
    };
    const openerBuf = await withVO(openerVid, seg2.openerNarration);
    const closerBuf = await withVO(closerVid, seg2.closerNarration);
    let roomsBuf: Buffer | null = null;
    if (photoBufs.length) {
      const roomNarrBuf = seg2.roomNarration
        ? await fetchBuffer(seg2.roomNarration).catch(() => null)
        : null;
      const perPhotoMs = Math.max(
        1800,
        Math.round(((seg2.roomNarrationDur ?? photoBufs.length * 4) / photoBufs.length) * 1000),
      );
      roomsBuf = await assembleMontage({
        scenes: photoBufs.map((b, i) => ({
          kind: "photo" as const,
          imageBuf: b,
          motion: motionForIndex(i),
          durationMs: perPhotoMs,
        })),
        audio: roomNarrBuf ? { narration: roomNarrBuf } : {},
      });
    }
    body = await assembleMontage({
      scenes: [openerBuf, ...(roomsBuf ? [roomsBuf] : []), closerBuf].map((b) => ({
        kind: "video" as const,
        videoBuf: b,
        durationMs: FULL_MS,
        keepAudio: true,
      })),
      audio: {},
    });
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
    lipsynced: lo.status === "completed" || lc.status === "completed",
  };
}

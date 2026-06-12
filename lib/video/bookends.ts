import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID, isMock } from "@/lib/heygen/client";
import { generateImageTalkingVideo } from "@/lib/heygen/cinematic";

type Db = SupabaseClient<Database>;

export interface BookendJobs {
  introId: string;
  outroId: string;
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

/** Extract one JPEG frame from a clip (default ~1s in, where the twin is visible). */
async function extractFrameJpeg(videoBuf: Buffer, atSec = 1): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  const dir = await mkdtemp(join(tmpdir(), "frame-"));
  try {
    const inPath = join(dir, "in.mp4");
    const outPath = join(dir, "f.jpg");
    await writeFile(inPath, videoBuf);
    await new Promise<void>((res, rej) =>
      execFile(
        ffmpegPath as string,
        ["-y", "-ss", String(atSec), "-i", inPath, "-frames:v", "1", "-q:v", "2", outPath],
        { maxBuffer: 1 << 24 },
        (e) => (e ? rej(e) : res()),
      ),
    );
    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * Fire the two lip-synced talking bookends as FULLY GENERATED in-scene shots —
 * never a presenter cutout composited over anything. Pipeline: take a frame from
 * the completed Seedance room clips (the twin standing IN the AI room, wearing
 * the selected outfit), then HeyGen v3 photo-to-video (`type:"image"`) animates
 * that whole frame into the twin talking — person and room are one shot, with
 * the cloned voice speaking the stored hook texts (script_segments.bookends).
 * Returns null when no usable twin/voice can be resolved.
 */
export async function startInSceneBookends(
  supabase: Db,
  videoId: string,
  introClipUrl: string,
  outroClipUrl: string,
): Promise<BookendJobs | null> {
  if (isMock) {
    return {
      introId: `mock_imgtalk_intro_${videoId.slice(0, 8)}`,
      outroId: `mock_imgtalk_outro_${videoId.slice(0, 8)}`,
    };
  }

  const { data: row } = await supabase
    .from("videos")
    .select("title, script_segments, avatar_id, user_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!row) return null;

  const meta = (
    row.script_segments as {
      bookends?: { intro?: string; outro?: string; imageUrl?: string | null };
    } | null
  )?.bookends;
  const introText =
    meta?.intro?.trim() || "Welcome in — let me show you around this home.";
  const outroText = meta?.outro?.trim() || "Want a private tour? Reach out today.";
  // Canonical look image (trained outfit look) — face-on by construction.
  const lookImageUrl = meta?.imageUrl || null;

  const { data: avatar } = await supabase
    .from("avatars")
    .select("voice_id")
    .eq("id", row.avatar_id ?? "")
    .maybeSingle();
  const voiceId = avatar?.voice_id ?? DEFAULT_VOICE_ID;

  // PREFERRED: the canonical look image (twin, chosen outfit, face-on) drives
  // both bookends directly — no frame extraction, no face-detection risk.
  if (lookImageUrl) {
    try {
      const [i, o] = await Promise.all([
        generateImageTalkingVideo({ imageUrl: lookImageUrl, script: introText, voiceId }),
        generateImageTalkingVideo({ imageUrl: lookImageUrl, script: outroText, voiceId }),
      ]);
      return { introId: i.jobId, outroId: o.jobId };
    } catch (e) {
      // Fall through to the frame ladder only on face-detection rejection.
      if (!(e instanceof Error && /no face detected/i.test(e.message))) throw e;
    }
  }

  // FALLBACK: frames from the first and last room clips — "the twin in the house".
  const [introClip, outroClip] = await Promise.all([
    fetchBuffer(introClipUrl),
    fetchBuffer(outroClipUrl),
  ]);

  // Host frames somewhere HeyGen can fetch (signed URLs on video-cache).
  const storage = adminConfigured ? createAdminClient() : supabase;
  const base = `${row.user_id}/${videoId}`;
  const frameUrl = async (name: string, buf: Buffer) => {
    const path = `${base}-${name}.jpg`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, buf, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`frame upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24);
    if (!signed?.signedUrl) throw new Error("frame sign failed");
    return signed.signedUrl;
  };

  // The photo-to-video engine REQUIRES a detectable face, and Seedance shots
  // often start behind/away from the agent — so a single fixed frame is a coin
  // flip ("No face detected"). Try several timestamps across both clips until
  // one is accepted; only face-detection rejections are retryable.
  const FRAME_TIMES_SEC = [2, 4, 6, 1];
  const clips: { tag: string; buf: Buffer }[] = [
    { tag: "a", buf: introClip },
    { tag: "b", buf: outroClip },
  ];
  const uploadedFrames = new Map<string, string>(); // "tag@t" -> signed URL
  const candidateUrl = async (clip: { tag: string; buf: Buffer }, t: number) => {
    const key = `${clip.tag}@${t}`;
    const hit = uploadedFrames.get(key);
    if (hit) return hit;
    const frame = await extractFrameJpeg(clip.buf, t);
    const url = await frameUrl(`bookend-${key.replace("@", "-")}`, frame);
    uploadedFrames.set(key, url);
    return url;
  };
  const isNoFace = (e: unknown) =>
    e instanceof Error && /no face detected/i.test(e.message);

  const makeTalking = async (
    preferred: { tag: string; buf: Buffer },
    fallback: { tag: string; buf: Buffer },
    script: string,
  ): Promise<string> => {
    let lastErr: unknown;
    for (const clip of [preferred, fallback]) {
      for (const t of FRAME_TIMES_SEC) {
        try {
          const imageUrl = await candidateUrl(clip, t);
          const { jobId } = await generateImageTalkingVideo({ imageUrl, script, voiceId });
          return jobId;
        } catch (e) {
          if (!isNoFace(e)) throw e;
          lastErr = e;
        }
      }
    }
    throw lastErr instanceof Error
      ? new Error(
          "No face visible in any room-clip frame — regenerate the video (the next room clips will open facing the agent).",
        )
      : new Error("Could not create the talking bookend.");
  };

  // Sequential (not parallel): the intro's successful frame warms the cache and
  // each rejected attempt is a fast 400.
  const introId = await makeTalking(clips[0], clips[1], introText);
  const outroId = await makeTalking(clips[1], clips[0], outroText);
  return { introId, outroId };
}

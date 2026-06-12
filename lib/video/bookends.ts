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
    row.script_segments as { bookends?: { intro?: string; outro?: string } } | null
  )?.bookends;
  const introText =
    meta?.intro?.trim() || "Welcome in — let me show you around this home.";
  const outroText = meta?.outro?.trim() || "Want a private tour? Reach out today.";

  const { data: avatar } = await supabase
    .from("avatars")
    .select("voice_id")
    .eq("id", row.avatar_id ?? "")
    .maybeSingle();
  const voiceId = avatar?.voice_id ?? DEFAULT_VOICE_ID;

  // Frames from the first and last room clips — "the twin in the house".
  const [introClip, outroClip] = await Promise.all([
    fetchBuffer(introClipUrl),
    fetchBuffer(outroClipUrl),
  ]);
  const [introFrame, outroFrame] = await Promise.all([
    extractFrameJpeg(introClip, 1),
    extractFrameJpeg(outroClip, 1),
  ]);

  // Host the frames somewhere HeyGen can fetch (signed URLs on video-cache).
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
  const [introImageUrl, outroImageUrl] = await Promise.all([
    frameUrl("bookend-intro", introFrame),
    frameUrl("bookend-outro", outroFrame),
  ]);

  const [i, o] = await Promise.all([
    generateImageTalkingVideo({ imageUrl: introImageUrl, script: introText, voiceId }),
    generateImageTalkingVideo({ imageUrl: outroImageUrl, script: outroText, voiceId }),
  ]);
  return { introId: i.jobId, outroId: o.jobId };
}

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
import { generateAvatarTalkingVideo } from "@/lib/heygen/cinematic";

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

/**
 * Heavily blur a room photo into a 9:16 shallow-focus background. The blur both
 * gives the "focused on the face, room softly behind" look AND dissolves any
 * detail, so the sharp talking twin reads as the only subject.
 */
async function blurTo916(photoBuf: Buffer): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  const dir = await mkdtemp(join(tmpdir(), "blur-"));
  try {
    const inPath = join(dir, "in.jpg");
    const outPath = join(dir, "bg.jpg");
    await writeFile(inPath, photoBuf);
    await new Promise<void>((res, rej) =>
      execFile(
        ffmpegPath as string,
        [
          "-y", "-i", inPath,
          // Fill a 720x1280 frame, then strong gaussian blur for bokeh depth.
          "-vf",
          "scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,gblur=sigma=32",
          "-frames:v", "1", "-q:v", "3", outPath,
        ],
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
 * Fire the two lip-synced talking bookends ("my twin in the room talking about
 * the property"). Driven by the user's ACTUAL twin avatar (v3 type:"avatar",
 * identity-locked — looks like the user, exactly like the Seedance room walk),
 * lip-syncing the cloned voice over a heavily-BLURRED listing-room photo. The
 * blur gives the shallow-focus "in the room, focused on the face" look and means
 * a single real twin on screen — no photo-to-video stranger, no double-twin.
 *
 * `introPhotoUrl`/`outroPhotoUrl` are LISTING PHOTOS (empty rooms — no person).
 * Returns null when no usable twin is found.
 */
export async function startInSceneBookends(
  supabase: Db,
  videoId: string,
  introPhotoUrl: string,
  outroPhotoUrl: string,
): Promise<BookendJobs | null> {
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

  if (isMock) {
    return {
      introId: `mock_be_intro_${videoId.slice(0, 8)}`,
      outroId: `mock_be_outro_${videoId.slice(0, 8)}`,
    };
  }

  const { data: avatar } = await supabase
    .from("avatars")
    .select("heygen_avatar_id, voice_id")
    .eq("id", row.avatar_id ?? "")
    .maybeSingle();
  if (!avatar?.heygen_avatar_id) return null;
  const voiceId = avatar.voice_id ?? DEFAULT_VOICE_ID;

  // Blur the room photos and host them where HeyGen can fetch them.
  const storage = adminConfigured ? createAdminClient() : supabase;
  const base = `${row.user_id}/${videoId}`;
  const bgUrl = async (name: string, photoUrl: string) => {
    const blurred = await blurTo916(await fetchBuffer(photoUrl));
    const path = `${base}-${name}.jpg`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, blurred, { contentType: "image/jpeg", upsert: true });
    if (up.error) throw new Error(`bg upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24);
    if (!signed?.signedUrl) throw new Error("bg sign failed");
    return signed.signedUrl;
  };
  const [introBg, outroBg] = await Promise.all([
    bgUrl("bookend-intro-bg", introPhotoUrl),
    bgUrl("bookend-outro-bg", outroPhotoUrl),
  ]);

  const [intro, outro] = await Promise.all([
    generateAvatarTalkingVideo({
      avatarId: avatar.heygen_avatar_id,
      script: introText,
      voiceId,
      backgroundImageUrl: introBg,
    }),
    generateAvatarTalkingVideo({
      avatarId: avatar.heygen_avatar_id,
      script: outroText,
      voiceId,
      backgroundImageUrl: outroBg,
    }),
  ]);
  return { introId: intro.jobId, outroId: outro.jobId };
}

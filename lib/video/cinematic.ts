import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { generateSpeech } from "@/lib/heygen/voice";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";

type Db = SupabaseClient<Database>;

/** Prefix marking a video whose heygen_video_id holds cinematic clip job ids. */
export const CINEMATIC_PREFIX = "cine:";

/** Floor per scene so each room shot is long enough to read. */
const MIN_SCENE_MS = 2500;

export function isCinematic(heygenVideoId: string | null | undefined): boolean {
  return !!heygenVideoId && heygenVideoId.startsWith(CINEMATIC_PREFIX);
}

export function encodeCinematicJobs(jobIds: string[]): string {
  return CINEMATIC_PREFIX + jobIds.join(",");
}

function decodeCinematicJobs(heygenVideoId: string): string[] {
  return heygenVideoId
    .slice(CINEMATIC_PREFIX.length)
    .split(",")
    .filter(Boolean);
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

interface AssemblableVideo {
  id: string;
  user_id: string;
  script: string | null;
  heygen_video_id: string | null;
  /** Real listing photo URLs — the faithful backbone of the montage. */
  photos: string[];
}

/**
 * Drive a cinematic video to completion. The real listing photos are the
 * faithful backbone (Ken-Burns motion); any rendered AI accent clips are
 * interleaved (~1 per 3 photos) as flair. Once all accents (if any) are ready,
 * generate cloned-voice narration, assemble the montage server-side, upload the
 * result to the private video-cache bucket, and complete the row. Best-effort:
 * any failure marks the row failed with a reason. Returns the resulting status.
 */
export async function assembleCinematicVideo(
  supabase: Db,
  video: AssemblableVideo,
  voiceId: string | null,
): Promise<"processing" | "completed" | "failed"> {
  if (!isCinematic(video.heygen_video_id)) return "processing";
  const jobIds = decodeCinematicJobs(video.heygen_video_id!);

  try {
    const statuses = jobIds.length
      ? await Promise.all(jobIds.map(getCinematicClipStatus))
      : [];

    if (statuses.some((s) => s.status === "failed")) {
      const reason =
        statuses.find((s) => s.status === "failed")?.error ??
        "A cinematic shot failed to render.";
      await supabase
        .from("videos")
        .update({ status: "failed", error: reason })
        .eq("id", video.id);
      return "failed";
    }
    if (statuses.some((s) => s.status !== "completed")) return "processing";

    const clipUrls = statuses.map((s) => s.videoUrl).filter(Boolean) as string[];
    if (clipUrls.length !== jobIds.length) return "processing";

    // Claim the row (processing -> submitting) so only one assembler runs the
    // heavy download/assemble/upload. If we didn't win the claim, another run
    // owns it — report processing and let that one finish.
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const narration = await generateSpeech(
      video.script?.trim() || "Welcome to this beautiful home.",
      voiceId ?? DEFAULT_VOICE_ID,
    );

    // The cinematic walkthrough IS the AI room clips (the twin walking through a
    // faithful recreation of each room). Each clip is one scene; narration plays
    // over the whole tour.
    const roomBufs = await Promise.all(clipUrls.map(fetchBuffer));
    if (roomBufs.length === 0) {
      throw new Error("No room clips to assemble.");
    }
    const perSceneMs = Math.max(
      MIN_SCENE_MS,
      Math.round(((narration.duration || 30) * 1000) / roomBufs.length),
    );
    const scenes: MontageScene[] = roomBufs.map((buf) => ({
      kind: "video",
      videoBuf: buf,
      durationMs: perSceneMs,
    }));

    const narrationBuf = await fetchBuffer(narration.audioUrl);
    const assembled = await assembleMontage({ scenes, audio: { narration: narrationBuf } });

    // Upload via the service-role client: the video-cache bucket's RLS only
    // permits trusted writes, and assembly may run with the user client (from the
    // poll path), which would hit "violates row-level security policy".
    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);

    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        duration: Math.round(narration.duration) || null,
      })
      .eq("id", video.id);
    return "completed";
  } catch (e) {
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error:
          e instanceof Error ? e.message : "Cinematic assembly failed.",
      })
      .eq("id", video.id);
    return "failed";
  }
}

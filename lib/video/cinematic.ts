import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { generateSpeech } from "@/lib/heygen/voice";
import { stitchClipsWithNarration } from "@/lib/video/stitch";

type Db = SupabaseClient<Database>;

/** Prefix marking a video whose heygen_video_id holds cinematic clip job ids. */
export const CINEMATIC_PREFIX = "cine:";

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
}

/**
 * Drive a cinematic video to completion: poll its per-room clips; once all are
 * rendered, generate cloned-voice narration, stitch the clips and mux the
 * narration server-side, upload the result to the private video-cache bucket,
 * and complete the row. Idempotent-ish and best-effort: any failure marks the
 * row failed with a reason. Returns the resulting status.
 */
export async function assembleCinematicVideo(
  supabase: Db,
  video: AssemblableVideo,
  voiceId: string | null,
): Promise<"processing" | "completed" | "failed"> {
  if (!isCinematic(video.heygen_video_id)) return "processing";
  const jobIds = decodeCinematicJobs(video.heygen_video_id!);
  if (jobIds.length === 0) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "No cinematic clips were created." })
      .eq("id", video.id);
    return "failed";
  }

  try {
    const statuses = await Promise.all(jobIds.map(getCinematicClipStatus));

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
    // heavy download/stitch/upload. If we didn't win the claim, another run owns
    // it — report processing and let that one finish.
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    // Narration in the agent's cloned voice (clips are silent/voice-over).
    const narration = await generateSpeech(
      video.script?.trim() || "Welcome to this beautiful home.",
      voiceId ?? DEFAULT_VOICE_ID,
    );

    const [clips, narrationBuf] = await Promise.all([
      Promise.all(clipUrls.map(fetchBuffer)),
      fetchBuffer(narration.audioUrl),
    ]);

    const stitched = await stitchClipsWithNarration(clips, narrationBuf);

    // Upload via the service-role client: the video-cache bucket's RLS only
    // permits trusted writes, and assembly may run with the user client (from the
    // poll path), which would hit "violates row-level security policy".
    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, stitched, { contentType: "video/mp4", upsert: true });
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

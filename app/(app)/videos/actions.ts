"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { generateWalkthroughScript } from "@/lib/ai/script";
import { generateVideo, getVideoStatus } from "@/lib/heygen/video";
import { isMock } from "@/lib/heygen/client";
import { listingPhotos } from "@/lib/format";
import type { Json, Tables } from "@/lib/types/database";

/**
 * Step 1 — create a video job for a listing and generate its script.
 * Redirects to the video page where the agent reviews/edits the script.
 */
export async function generateForListing(formData: FormData) {
  const { userId } = await requireUser();
  const listingId = formData.get("listingId") as string;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .single();
  if (!listing) redirect("/listings");

  const { data: avatar } = await supabase
    .from("avatars")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();

  const { data: video, error } = await supabase
    .from("videos")
    .insert({
      user_id: userId,
      listing_id: listingId,
      avatar_id: avatar?.id ?? null,
      title: listing.address,
      status: "pending_script",
    })
    .select("id")
    .single();
  if (error || !video) redirect(`/listings/${listingId}`);

  const script = await generateWalkthroughScript(listing as Tables<"listings">);

  await supabase
    .from("videos")
    .update({
      script: script.narration,
      script_segments: script.segments as unknown as Json,
      status: "script_ready",
    })
    .eq("id", video.id);

  revalidatePath("/videos");
  redirect(`/videos/${video.id}`);
}

export async function updateScript(videoId: string, script: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("videos").update({ script }).eq("id", videoId);
  revalidatePath(`/videos/${videoId}`);
}

/**
 * Step 2 — submit the (possibly edited) script to HeyGen.
 * Moves the job to `processing`; completion arrives via webhook (real) or is
 * simulated by pollVideoStatus (mock).
 */
export async function submitVideo(videoId: string) {
  const { userId } = await requireUser();
  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(*), avatars(*)")
    .eq("id", videoId)
    .single();
  if (!video || !video.script) return;

  await supabase
    .from("videos")
    .update({ status: "submitting" })
    .eq("id", videoId);

  const listing = video.listings as Tables<"listings"> | null;
  const avatar = video.avatars as Tables<"avatars"> | null;
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];

  try {
    const result = await generateVideo({
      avatarId: avatar?.heygen_avatar_id ?? "mock_avatar",
      voiceId: avatar?.voice_id ?? undefined,
      script: video.script,
      photoUrls: photos,
      title: video.title ?? undefined,
      webhookUrl: `${env.siteUrl}/api/webhooks/heygen?secret=${env.heygenWebhookSecret}`,
    });

    await supabase
      .from("videos")
      .update({
        heygen_video_id: result.videoId,
        status: "processing",
        thumbnail_url: photos[0] ?? null,
      })
      .eq("id", videoId)
      .eq("user_id", userId);
  } catch (e) {
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Generation failed.",
      })
      .eq("id", videoId);
  }

  revalidatePath(`/videos/${videoId}`);
}

/**
 * Polls a job's status and returns the latest video row. In mock mode it
 * simulates a realistic processing window (~6s) before completing — no webhook
 * needed. Used by the video page client to drive the live UI.
 */
export async function pollVideoStatus(
  videoId: string,
): Promise<Tables<"videos"> | null> {
  await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("*")
    .eq("id", videoId)
    .single();
  if (!video) return null;

  if (video.status === "processing" && video.heygen_video_id) {
    const elapsed = Date.now() - new Date(video.updated_at).getTime();
    const ready = isMock ? elapsed > 6000 : true;

    if (ready) {
      const status = await getVideoStatus(video.heygen_video_id, {
        thumbnailUrl: video.thumbnail_url ?? undefined,
      });
      if (status.status === "completed") {
        const { data: updated } = await supabase
          .from("videos")
          .update({
            status: "completed",
            video_url: status.videoUrl ?? null,
            thumbnail_url: status.thumbnailUrl ?? video.thumbnail_url,
            duration: status.duration ?? null,
          })
          .eq("id", videoId)
          .select("*")
          .single();
        return updated ?? video;
      }
      if (status.status === "failed") {
        const { data: updated } = await supabase
          .from("videos")
          .update({ status: "failed", error: status.error ?? "Failed" })
          .eq("id", videoId)
          .select("*")
          .single();
        return updated ?? video;
      }
    }
  }

  return video;
}

export async function deleteVideo(formData: FormData) {
  await requireUser();
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("videos").delete().eq("id", id);
  revalidatePath("/videos");
  redirect("/videos");
}

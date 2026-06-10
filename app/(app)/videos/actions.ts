"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { generateWalkthroughScript } from "@/lib/ai/script";
import { generateVideo, getVideoStatus } from "@/lib/heygen/video";
import { generateCinematicClip } from "@/lib/heygen/cinematic";
import { getTwinConsentStatus, isConsentVerified } from "@/lib/heygen/avatar";
import {
  assembleCinematicVideo,
  encodeCinematicJobs,
  isCinematic,
} from "@/lib/video/cinematic";
import { isMock } from "@/lib/heygen/client";
import { listingPhotos } from "@/lib/format";
import type { Json, Tables } from "@/lib/types/database";

/** Max cinematic shots (one per listing photo) — caps render cost/time.
 * Kept low (2) while validating quality + the stitch pipeline; raise once proven. */
const MAX_CINEMATIC_SHOTS = 2;

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
      // Digital twins store distinct look/group ids; a legacy talking photo
      // stores the same id in both. Passing the kind makes a twin render as a
      // matted, background-removed presenter standing in the room (not a circle).
      avatarKind:
        avatar?.heygen_asset_id &&
        avatar.heygen_asset_id !== avatar.heygen_avatar_id
          ? "digital_twin"
          : "talking_photo",
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
 * Motion brief for ONE cinematic shot. This is what makes the agent appear to
 * be *inside* the room (walking/presenting), not composited in front of a photo.
 * It describes the subject's action + camera move + look; the reference photo
 * steers the room, and the narration is muxed separately (so this is voice-over,
 * not lip-sync). Varied camera moves per shot keep the walkthrough dynamic.
 */
function cinematicPrompt(
  listing: Tables<"listings"> | null,
  index: number,
  total: number,
): string {
  const moves = [
    "the camera walks in behind the agent on a smooth gimbal, following them into the space",
    "a steady tracking shot glides alongside the agent as they move through the room",
    "a slow cinematic dolly-in pushes toward the agent as they gesture to the room",
    "the camera slowly orbits the agent, revealing the room around them",
  ];
  const move = moves[index % moves.length];
  const place = listing?.address
    ? `the home at ${listing.address}`
    : "a bright, beautifully staged home";
  return [
    "Photorealistic vertical 9:16 real-estate walkthrough.",
    `A friendly, well-dressed real-estate agent is physically inside a room of ${place},`,
    "walking through the space and presenting it to the viewer — looking around,",
    "gesturing naturally toward the room's best features with genuine warmth and confidence.",
    `Camera: ${move}; cinematic, steady, handheld realism.`,
    "Bright natural daylight, inviting and true-to-life, matching the reference interior.",
    "Continuous lifelike human motion, full body visible, the same person throughout.",
    `Shot ${index + 1} of ${total}.`,
  ].join(" ");
}

/**
 * Cinematic alternative to submitVideo: generate one Seedance "Avatar Shots"
 * clip per listing photo (the verified twin moving through the scene), to be
 * stitched + narrated by assembleCinematicVideo. Requires a consent-validated
 * digital twin. Stores the clip job ids in heygen_video_id (cine:<id,id,...>).
 */
export async function submitCinematicVideo(videoId: string) {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(*), avatars(*)")
    .eq("id", videoId)
    .single();
  if (!video || !video.script) return;

  const listing = video.listings as Tables<"listings"> | null;
  const avatar = video.avatars as Tables<"avatars"> | null;
  const isTwin =
    !!avatar?.heygen_asset_id &&
    avatar.heygen_asset_id !== avatar.heygen_avatar_id;

  const fail = async (error: string) => {
    await supabase.from("videos").update({ status: "failed", error }).eq("id", videoId);
    revalidatePath(`/videos/${videoId}`);
  };

  if (!avatar || !isTwin || !avatar.heygen_avatar_id) {
    return fail("Cinematic mode needs a digital-twin avatar.");
  }
  if (!isMock) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id!);
    if (!isConsentVerified(consent)) {
      return fail(
        "Verify your twin's identity (Settings → Avatar → Cinematic mode) to use cinematic.",
      );
    }
  }

  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];
  const usePhotos = photos.slice(0, MAX_CINEMATIC_SHOTS);
  if (usePhotos.length === 0) {
    return fail("Add listing photos to generate a cinematic walkthrough.");
  }

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    const jobs = await Promise.all(
      usePhotos.map((url, i) =>
        generateCinematicClip({
          avatarLookId: avatar.heygen_avatar_id!,
          referenceUrl: url,
          prompt: cinematicPrompt(listing, i, usePhotos.length),
          duration: 10,
        }),
      ),
    );
    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs(jobs.map((j) => j.jobId)),
        status: "processing",
        thumbnail_url: usePhotos[0] ?? null,
      })
      .eq("id", videoId)
      .eq("user_id", userId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Cinematic generation failed.");
    return;
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

  // Cinematic walkthroughs are assembled from several Seedance clips: poll them
  // and, once ready, stitch + narrate (assembleCinematicVideo self-locks so
  // concurrent polls don't double-run the heavy step).
  if (isCinematic(video.heygen_video_id) && video.status === "processing") {
    const { data: av } = await supabase
      .from("avatars")
      .select("voice_id")
      .eq("id", video.avatar_id ?? "")
      .maybeSingle();
    await assembleCinematicVideo(
      supabase,
      {
        id: video.id,
        user_id: video.user_id,
        script: video.script,
        heygen_video_id: video.heygen_video_id,
      },
      av?.voice_id ?? null,
    );
    const { data: latest } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .single();
    return latest ?? video;
  }

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

"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { generateCinematicClip } from "@/lib/heygen/cinematic";
import {
  getDigitalTwinStatus,
  getTwinConsentStatus,
  isConsentVerified,
} from "@/lib/heygen/avatar";
import { encodeCinematicJobs } from "@/lib/video/cinematic";
import { isMock } from "@/lib/heygen/client";
import { listingPhotos } from "@/lib/format";
import type { Tables } from "@/lib/types/database";

export type StudioGenerateResult =
  | { videoId: string }
  | {
      error: "no_avatar" | "no_listing" | "needs_twin" | "generate_failed";
      message?: string;
    };

/** AI accent clips (twin flair) per video. The real photos are the backbone. */
const MAX_CINEMATIC_ACCENTS = 1;

function accentPrompt(listing: Tables<"listings"> | null): string {
  const place = listing?.address
    ? `the home at ${listing.address}`
    : "a bright, beautifully staged home";
  return [
    "Photorealistic vertical 9:16 real-estate walkthrough.",
    `A friendly, well-dressed real-estate agent is physically inside a room of ${place},`,
    "walking through the space and presenting it with genuine warmth and confidence.",
    "Camera: a smooth cinematic gimbal move following the agent; steady, handheld realism.",
    "Bright natural daylight, true-to-life, matching the reference interior.",
    "Continuous lifelike human motion, full body visible.",
  ].join(" ");
}

/**
 * Real Video Studio generation — the DIGITAL-TWIN WALKTHROUGH (cinematic): the
 * real listing photos with cinematic motion plus the agent's consent-verified
 * twin. There is intentionally NO presenter / avatar-over-photos path. Returns
 * the internal video id to poll (the poll drives server-side assembly).
 */
export async function studioGenerate(
  listingId: string,
  scriptText: string,
  title?: string,
): Promise<StudioGenerateResult> {
  const { userId } = await requireUser();
  const supabase = await createClient();

  const { data: avatar } = await supabase
    .from("avatars")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (!avatar?.heygen_avatar_id) return { error: "no_avatar" };

  // Twins store a distinct group id in heygen_asset_id; talking photos store it
  // equal to the avatar id. Walkthroughs REQUIRE a digital twin.
  const isTwin =
    !!avatar.heygen_asset_id &&
    avatar.heygen_asset_id !== avatar.heygen_avatar_id;
  if (!isTwin) {
    return {
      error: "needs_twin",
      message:
        "Set up a digital twin (Settings → Avatar) — every walkthrough stars your twin.",
    };
  }

  // A twin must finish training before it can render.
  if (avatar.status !== "ready") {
    const status = await getDigitalTwinStatus(avatar.heygen_avatar_id);
    if (status !== avatar.status) {
      await supabase.from("avatars").update({ status }).eq("id", avatar.id);
    }
    if (status === "failed") {
      return {
        error: "generate_failed",
        message: "Avatar training failed — please re-upload a clearer video.",
      };
    }
    if (status !== "ready") {
      return {
        error: "generate_failed",
        message: "Your avatar is still training — try again in a few minutes.",
      };
    }
  }

  // Cinematic (Seedance) requires a consent-validated twin.
  if (!isMock) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id!);
    if (!isConsentVerified(consent)) {
      return {
        error: "needs_twin",
        message:
          "Verify your twin's identity (Settings → Avatar → Cinematic mode) to generate.",
      };
    }
  }

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { error: "no_listing" };

  const photos = listingPhotos(listing.photos).map((p) => p.url);
  if (photos.length === 0) {
    return { error: "no_listing", message: "Add listing photos first." };
  }

  const { data: video, error: insErr } = await supabase
    .from("videos")
    .insert({
      user_id: userId,
      listing_id: listingId,
      avatar_id: avatar.id,
      title: title ?? listing.address,
      script: scriptText,
      status: "submitting",
      thumbnail_url: photos[0] ?? null,
    })
    .select("id")
    .single();
  if (insErr || !video)
    return { error: "generate_failed", message: insErr?.message };

  try {
    // Real photos are the faithful backbone (assembled from the poll); add <=1
    // cinematic accent of the twin moving through the space.
    const accentPhotos = photos.slice(0, MAX_CINEMATIC_ACCENTS);
    const jobs = await Promise.all(
      accentPhotos.map((url) =>
        generateCinematicClip({
          avatarLookId: avatar.heygen_avatar_id!,
          referenceUrl: url,
          prompt: accentPrompt(listing as Tables<"listings">),
          duration: 10,
        }),
      ),
    );
    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs("", "", jobs.map((j) => j.jobId)),
        status: "processing",
      })
      .eq("id", video.id);
    return { videoId: video.id };
  } catch (e) {
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Generation failed.",
      })
      .eq("id", video.id);
    return {
      error: "generate_failed",
      message: e instanceof Error ? e.message : undefined,
    };
  }
}

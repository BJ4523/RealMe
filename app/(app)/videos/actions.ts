"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  generateWalkthroughScript,
  generateHypeReelScript,
  generateOpeningPitch,
} from "@/lib/ai/script";
import {
  encodeReelJobs,
  isHypeReel,
  assembleHypeReel,
  type ReelListingFacts,
} from "@/lib/video/hypereel";
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

/** Hard cap on AI room clips per cinematic walkthrough (one Seedance clip per
 * listing photo). The agent picks how many within this; caps cost/render time. */
const MAX_CINEMATIC_ROOMS = 8;
const DEFAULT_CINEMATIC_ROOMS = 5;
/** AI room clips in a Hype Reel's middle tour (between the host bookends). Must
 * match ROOM_PHOTO_SHOTS in lib/video/hypereel.ts (beat-synced durations). */
const HYPE_REEL_ROOMS = 3;

/**
 * Create a draft video for a listing and return its id (no redirect) so a CLIENT
 * surface (e.g. the dashboard Studio) can navigate to /videos/[id] — the single
 * place where the agent reviews the script and picks the type (Cinematic
 * walkthrough vs Hype reel). Optionally seed the script (else one is generated).
 */
export async function createDraftForListing(
  listingId: string,
  scriptText?: string,
): Promise<{ videoId: string } | { error: string }> {
  const { userId } = await requireUser();
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { error: "Listing not found." };

  const { data: avatar } = await supabase
    .from("avatars")
    .select("id")
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
  if (error || !video) return { error: error?.message ?? "Could not start video." };

  // The editable box is the agent's OPENING PITCH (spoken lip-synced in front of
  // the house). AI-generated via Claude; the user edits it. The room-walk
  // voiceover is generated separately at submit (script_segments.roomNarration).
  const seeded = scriptText?.trim();
  const pitch = seeded
    ? seeded
    : await generateOpeningPitch(listing as Tables<"listings">);

  await supabase
    .from("videos")
    .update({ script: pitch, status: "script_ready" })
    .eq("id", video.id);

  return { videoId: video.id };
}

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
  wardrobe: string,
): string {
  // Face-forward moves FIRST: the talking bookends are generated from frames of
  // these clips and HeyGen's face detector must find the agent (a behind-the-
  // agent opener gave it the back of a head — "No face detected").
  const moves = [
    "a slow cinematic dolly-in pushes toward the agent, who faces the camera as they gesture to the room",
    "a steady tracking shot glides alongside the agent as they move through the room",
    "the camera slowly orbits the agent, revealing the room around them",
    "the camera walks in behind the agent on a smooth gimbal, following them into the space",
  ];
  const move = moves[index % moves.length];
  const place = listing?.address ? `the home at ${listing.address}` : "this home";
  return [
    "Photorealistic vertical 9:16 real-estate walkthrough.",
    // FIDELITY FIRST: faithfully recreate the EXACT room in the reference image.
    "Recreate the room shown in the reference image as accurately as possible:",
    "the same layout, furniture, wall colors, flooring, windows, fixtures and finishes.",
    "Do NOT invent, rearrange, or add furniture — keep the space true to the reference.",
    // Consistent wardrobe across every shot (clothes must not change room to room).
    `Inside that recreated room of ${place}, a real-estate agent ${wardrobe}`,
    "walks calmly through the space, looking around and gesturing toward its features.",
    // EXACTLY ONE PERSON. Seedance otherwise hallucinates bystanders, and a
    // two-person frame then gets grabbed for the talking bookend ("two people").
    "CRITICAL: there is EXACTLY ONE person in the entire scene — the agent, completely alone.",
    "No other people, no bystanders, no background figures, no second person, no crowd,",
    "and no reflections, paintings or photos depicting other people. Only the single agent.",
    // Do NOT animate talking — the lip-sync looks fake; voice is added as voice-over.
    "IMPORTANT: the agent does NOT speak — keep the mouth closed and relaxed, with",
    "no talking, no lip movement, no jaw motion. The voice-over is added separately.",
    `Camera: ${move}; cinematic, steady, bright natural daylight.`,
    `Continuous lifelike motion, full body visible — the SAME person wearing the SAME outfit (${wardrobe}) in every shot.`,
    `Room ${index + 1} of ${total}.`,
  ].join(" ");
}

/**
 * Cinematic alternative to submitVideo: generate one Seedance "Avatar Shots"
 * clip per listing photo (the verified twin moving through the scene), to be
 * stitched + narrated by assembleCinematicVideo. Requires a consent-validated
 * digital twin. Stores the clip job ids in heygen_video_id (cine:<id,id,...>).
 */
/**
 * Always the real digital twin in its OWN trained outfit — never a picked
 * outfit. The lip-synced opening bookend (v3 avatar) can only wear the trained
 * outfit (v3 has no clothing control), so for the opening to MATCH the cinematic
 * the rooms must use the trained outfit too. The Seedance wardrobe clause
 * therefore pins "the same clothing the agent already wears, identical in every
 * shot" rather than imposing a new garment.
 */
function resolveLook(
  avatar: Tables<"avatars">,
): { lookId: string; wardrobe: string } {
  return {
    lookId: avatar.heygen_avatar_id!,
    wardrobe:
      "wearing their own natural clothing — the EXACT SAME outfit in every single shot, never changing",
  };
}

export async function submitCinematicVideo(
  videoId: string,
  _outfitId?: string,
  roomCount?: number,
) {
  const rooms = Math.min(
    Math.max(Math.round(roomCount ?? DEFAULT_CINEMATIC_ROOMS), 1),
    MAX_CINEMATIC_ROOMS,
  );
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
  if (photos.length === 0) {
    return fail("Add listing photos to generate a cinematic walkthrough.");
  }
  // One AI room per photo (capped by the agent's chosen count): the twin walks
  // through a faithful recreation of each.
  const roomPhotos = photos.slice(0, rooms);

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    // Room clips first — the real twin in its trained outfit (consistent
    // everywhere). The OPENING bookend speaks the editable box (video.script =
    // the agent's pitch); the rooms get their OWN auto voiceover; a short CTA
    // closes. The bookends are generated LATER by the assembler.
    const { lookId, wardrobe } = resolveLook(avatar);
    const openingPitch =
      video.script?.trim() || "Let me show you this incredible home.";
    const [hook, roomScript] = await Promise.all([
      generateHypeReelScript(listing as Tables<"listings">),
      generateWalkthroughScript(listing as Tables<"listings">),
    ]);
    const roomJobs = await Promise.all(
      roomPhotos.map((url, i) =>
        generateCinematicClip({
          avatarLookId: lookId,
          referenceUrl: url,
          prompt: cinematicPrompt(listing, i, roomPhotos.length, wardrobe),
          duration: 10,
        }),
      ),
    );
    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs(
          "",
          "",
          roomJobs.map((j) => j.jobId),
        ),
        status: "processing",
        thumbnail_url: photos[0] ?? null,
        script_segments: {
          // Opening speaks the editable pitch; rooms narrate their own script.
          bookends: { intro: openingPitch, outro: hook.outro },
          roomNarration: roomScript.narration,
        } as unknown as Json,
      })
      .eq("id", videoId)
      .eq("user_id", userId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Cinematic generation failed.");
    return;
  }
  revalidatePath(`/videos/${videoId}`);
}

/** Hype Reel: v2 host bookends + real-photo tour + <=1 accent + music + overlays. */
export async function submitHypeReelVideo(
  videoId: string,
  trackId?: string,
  _outfitId?: string,
) {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos").select("*, listings(*), avatars(*)").eq("id", videoId).single();
  if (!video) return;

  const listing = video.listings as Tables<"listings"> | null;
  const avatar = video.avatars as Tables<"avatars"> | null;
  const isTwin =
    !!avatar?.heygen_asset_id && avatar.heygen_asset_id !== avatar.heygen_avatar_id;

  const fail = async (error: string) => {
    await supabase.from("videos").update({ status: "failed", error }).eq("id", videoId);
    revalidatePath(`/videos/${videoId}`);
  };

  if (!avatar || !isTwin || !avatar.heygen_avatar_id) {
    return fail("Hype Reel needs a digital-twin avatar.");
  }
  if (!isMock) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id!);
    if (!isConsentVerified(consent)) {
      return fail("Verify your twin's identity (Settings → Avatar → Cinematic mode) to use Hype Reel.");
    }
  }
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];
  if (photos.length === 0) return fail("Add listing photos to generate a Hype Reel.");
  const hero = photos[0];

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    // Room clips only at submit — real twin, trained outfit (consistent). The
    // lip-synced bookends are generated LATER by the assembler.
    const { lookId, wardrobe } = resolveLook(avatar);
    const script = await generateHypeReelScript(listing as Tables<"listings">);
    const roomPhotos = photos.slice(0, HYPE_REEL_ROOMS);
    const roomJobs = await Promise.all(
      roomPhotos.map((url, i) =>
        generateCinematicClip({
          avatarLookId: lookId,
          referenceUrl: url,
          prompt: cinematicPrompt(listing, i, roomPhotos.length, wardrobe),
          duration: 8,
        }),
      ),
    );

    await supabase.from("videos").update({
      heygen_video_id: encodeReelJobs("", "", roomJobs.map((j) => j.jobId)),
      status: "processing",
      thumbnail_url: hero,
      script_segments: {
        hypeReel: {
          featureCallouts: script.featureCallouts,
          trackId: trackId ?? "default",
        },
        bookends: {
          intro: script.intro,
          outro: script.outro,
        },
      } as unknown as Json,
    }).eq("id", videoId).eq("user_id", userId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Hype Reel generation failed.");
    return;
  }
  revalidatePath(`/videos/${videoId}`);
}

/**
 * Polls a job's status and returns the latest video row. In mock mode it
 * simulates a realistic processing window (~6s) before completing — no webhook
 * needed. Used by the video page client to drive the live UI.
 */
/** Structured listing facts for Hype Reel overlays (price formatted for display). */
function reelFacts(listing: Tables<"listings"> | null): ReelListingFacts {
  return {
    price: listing?.price
      ? `$${Math.round(Number(listing.price)).toLocaleString("en-US")}`
      : null,
    beds: listing?.beds ?? null,
    baths: listing?.baths ?? null,
    sqft: listing?.sqft ?? null,
    address: listing?.address ?? null,
  };
}

export async function pollVideoStatus(
  videoId: string,
): Promise<Tables<"videos"> | null> {
  await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(*)")
    .eq("id", videoId)
    .single();
  if (!video) return null;

  const pollListing = video.listings as Tables<"listings"> | null;
  const photos = pollListing ? listingPhotos(pollListing.photos).map((p) => p.url) : [];

  // Hype Reel: host bookends (v2) + accents (v3) → montage with music + overlays.
  // Intercept before the generic v2 branch (a "reel:" id is not a real HeyGen id).
  if (isHypeReel(video.heygen_video_id) && video.status === "processing") {
    const meta = (
      video.script_segments as {
        hypeReel?: { featureCallouts?: string[]; trackId?: string };
      } | null
    )?.hypeReel;
    await assembleHypeReel(supabase, {
      id: video.id,
      user_id: video.user_id,
      heygen_video_id: video.heygen_video_id,
      photos,
      facts: reelFacts(pollListing),
      featureCallouts: meta?.featureCallouts ?? [],
      trackId: meta?.trackId ?? null,
    });
    const { data: latest } = await supabase
      .from("videos")
      .select("*")
      .eq("id", videoId)
      .single();
    return latest ?? video;
  }

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
        roomNarration:
          (video.script_segments as { roomNarration?: string } | null)
            ?.roomNarration ?? null,
        heygen_video_id: video.heygen_video_id,
        photos,
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

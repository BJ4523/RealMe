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
import { wardrobePrompt } from "@/lib/video/wardrobe";
import type { Json, Tables } from "@/lib/types/database";

/** Hard cap on AI room clips per cinematic walkthrough (one Seedance clip per
 * listing photo). The agent picks how many within this; caps cost/render time. */
const MAX_CINEMATIC_ROOMS = 8;
const DEFAULT_CINEMATIC_ROOMS = 2;
/** AI room clips in a Hype Reel's middle tour (between the host bookends). Must
 * match ROOM_PHOTO_SHOTS in lib/video/hypereel.ts (beat-synced durations). */
const HYPE_REEL_ROOMS = 2;

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
 * Motion brief for ONE cinematic room shot. The agent moves through a faithful
 * recreation of the room WHILE addressing the camera — the face must stay
 * clearly visible because this clip is lip-synced to the cloned voice afterward
 * (HeyGen Lipsync-Precision). The reference photo steers the room.
 */
function cinematicPrompt(
  listing: Tables<"listings"> | null,
  index: number,
  total: number,
  wardrobe: string,
): string {
  // Keep the FACE toward camera on every move (lip-sync needs a visible face).
  const moves = [
    "a slow cinematic dolly-in pushes toward the agent as they face the camera and gesture to the room",
    "a steady tracking shot glides with the agent as they walk forward facing the camera, presenting the room",
    "the camera slowly arcs to stay in front of the agent as they move through, keeping their face to camera",
    "a smooth gimbal move leads the agent backward through the space as they address the camera",
  ];
  const move = moves[index % moves.length];
  const place = listing?.address ? `the home at ${listing.address}` : "this home";
  return [
    "Photorealistic vertical 9:16 cinematic real-estate walkthrough, premium",
    "launch-film look — warm natural light, shallow depth of field, gentle grain.",
    // FIDELITY FIRST: faithfully recreate the EXACT room in the reference image.
    "Recreate the room in the reference image accurately: the same layout, furniture,",
    "wall colors, flooring, windows, fixtures and finishes. Do NOT invent or rearrange.",
    `Inside that recreated room of ${place}, a charismatic real-estate agent ${wardrobe}`,
    "moves through the space presenting it, looking toward the camera and gesturing to its features.",
    // Face visible for lip-sync.
    "The agent FACES the camera with their face clearly visible throughout, engaged and warm.",
    // Single subject.
    "EXACTLY ONE person in the scene — the agent, completely alone. No other people,",
    "bystanders, background figures, reflections or photos of other people.",
    `Camera: ${move}; cinematic, steady, bright.`,
    `Full body visible — the SAME person in the SAME outfit (${wardrobe}) in every shot.`,
    `Room ${index + 1} of ${total}.`,
  ].join(" ");
}

/**
 * Motion brief for the EXTERIOR opener/closer Seedance shot: the agent standing
 * confidently in front of the house (recreated from the exterior photo),
 * presenter energy. Same engine as the room walk so the shots cut together; the
 * pitch/CTA is muxed as voice-over (so mouth stays relaxed — no fake lip-sync).
 */
function cinematicExteriorPrompt(
  listing: Tables<"listings"> | null,
  kind: "intro" | "closer",
  wardrobe: string,
): string {
  const place = listing?.address ? `the home at ${listing.address}` : "this home";
  return [
    "Premium cinematic vertical 9:16 real-estate hero shot, the look of a polished",
    "luxury listing launch film — warm golden-hour light, shallow depth of field,",
    "rich filmic color, gentle film grain.",
    // Faithful exterior — the opener and closer MUST show the identical yard.
    "Recreate the house EXTERIOR in the reference image EXACTLY and faithfully:",
    "the same architecture, materials, roof, windows, AND the identical FRONT YARD —",
    "the same lawn, landscaping, plants, trees, walkway and driveway, in the same",
    "positions. This is the SAME house and SAME front yard in both the opening and",
    "closing shots — they must match, do not invent or rearrange the yard.",
    `In front of ${place}, a confident, charismatic real-estate agent ${wardrobe}`,
    kind === "intro"
      ? "addresses the camera directly with warm, engaging presenter energy — a natural welcoming gesture toward the home, as if greeting a buyer."
      : "gives a warm, inviting close to the camera with an open gesture toward the home.",
    // Single subject, cinematic camera.
    "EXACTLY ONE person in frame — the agent, alone. No other people, bystanders,",
    "background figures or crowds.",
    "Camera: a slow, smooth cinematic push-in on a gimbal, the agent full-body then",
    "settling to a confident medium shot; steady, premium, magazine-quality.",
    `The SAME person in the SAME outfit (${wardrobe}) — consistent throughout.`,
  ].join(" ");
}

/**
 * Derive exactly `count` short narration lines (one per room beat) from the
 * walkthrough script. Uses its photo-mapped segment lines, then pads from the
 * sentence stream so every room clip has something to lip-sync to.
 */
function beatLinesForRooms(
  script: { narration: string; segments: { line: string }[] },
  count: number,
): string[] {
  const fromSegments = script.segments.map((s) => s.line.trim()).filter(Boolean);
  const sentences = (script.narration.match(/[^.!?]+[.!?]+/g) ?? [])
    .map((s) => s.trim())
    .filter(Boolean);
  const pool = fromSegments.length >= count ? fromSegments : [...fromSegments, ...sentences];
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    out.push(pool[i] ?? sentences[i % Math.max(1, sentences.length)] ?? "Take a look at this space.");
  }
  return out;
}

/**
 * Cinematic alternative to submitVideo: generate one Seedance "Avatar Shots"
 * clip per listing photo (the verified twin moving through the scene), to be
 * stitched + narrated by assembleCinematicVideo. Requires a consent-validated
 * digital twin. Stores the clip job ids in heygen_video_id (cine:<id,id,...>).
 */
/**
 * Always the real digital twin (avatar_id). The agent PICKS the outfit; its
 * concrete clause (incl. footwear, from lib/video/wardrobe) is pinned into every
 * shot's prompt with "identical in every shot" emphasis, so the independently-
 * generated Seedance clips don't drift (shoe color, garments).
 */
function resolveLook(
  avatar: Tables<"avatars">,
  outfitId?: string,
): { lookId: string; wardrobe: string } {
  return {
    lookId: avatar.heygen_avatar_id!,
    wardrobe: wardrobePrompt(outfitId),
  };
}

/**
 * Fire the silent cinematic_avatar beat clips shared by BOTH video paths:
 * exterior opener + one room clip per photo + exterior closer, all the real twin
 * in the chosen outfit. Returns the clip ids in playback order.
 */
async function fireBeatClips(opts: {
  lookId: string;
  wardrobe: string;
  listing: Tables<"listings"> | null;
  exterior: string;
  roomPhotos: string[];
  openerSec?: number;
  roomSec?: number;
  closerSec?: number;
}): Promise<string[]> {
  const { lookId, wardrobe, listing, exterior, roomPhotos } = opts;
  const [opener, rooms, closer] = await Promise.all([
    generateCinematicClip({
      avatarLookId: lookId,
      referenceUrl: exterior,
      prompt: cinematicExteriorPrompt(listing, "intro", wardrobe),
      duration: opts.openerSec ?? 10,
    }),
    Promise.all(
      roomPhotos.map((url, i) =>
        generateCinematicClip({
          avatarLookId: lookId,
          referenceUrl: url,
          prompt: cinematicPrompt(listing, i, roomPhotos.length, wardrobe),
          duration: opts.roomSec ?? 10,
        }),
      ),
    ),
    generateCinematicClip({
      avatarLookId: lookId,
      referenceUrl: exterior,
      prompt: cinematicExteriorPrompt(listing, "closer", wardrobe),
      duration: opts.closerSec ?? 8,
    }),
  ]);
  return [opener.jobId, ...rooms.map((j) => j.jobId), closer.jobId];
}

export async function submitCinematicVideo(
  videoId: string,
  outfitId?: string,
  roomCount?: number,
  captions: boolean = true,
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
    // CINEMATIC AVATAR + LIPSYNC pipeline (one clean path):
    //   per beat:  cinematic_avatar clip (silent, keeps likeness)
    //   later:     cloned-voice TTS  ->  Lipsync-Precision onto the clip
    // Result: the real twin walking/presenting through the home, TALKING in
    // their own voice, lip-synced. Beats = exterior opener + each room +
    // exterior closer. Here we just fire the (silent) clips and store the
    // per-beat scripts; the assembler does TTS + lipsync + stitch.
    const { lookId, wardrobe } = resolveLook(avatar, outfitId);
    const exterior = photos[0];
    const openingPitch =
      video.script?.trim() || "Welcome — let me show you this beautiful home.";
    const [hook, roomScript] = await Promise.all([
      generateHypeReelScript(listing as Tables<"listings">),
      generateWalkthroughScript(listing as Tables<"listings">),
    ]);
    const roomLines = beatLinesForRooms(roomScript, roomPhotos.length);
    const cta = hook.outro?.trim() || "Reach out today to see it in person.";

    // Clips and their per-beat scripts share one order: [opener, ...rooms, closer].
    const allClips = await fireBeatClips({ lookId, wardrobe, listing, exterior, roomPhotos });
    const beats = [openingPitch, ...roomLines, cta];

    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs("", "", allClips),
        status: "processing",
        thumbnail_url: photos[0] ?? null,
        script_segments: { beats, captions } as unknown as Json,
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
  outfitId?: string,
  captions: boolean = true,
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
    // SAME pipeline as the cinematic walkthrough (cinematic_avatar + Lipsync-
    // Precision → the twin TALKING in their own voice), just with MUSIC built in.
    // Punchy short script so it lands ~15s.
    const { lookId, wardrobe } = resolveLook(avatar, outfitId);
    const script = await generateHypeReelScript(listing as Tables<"listings">);
    const beats = [script.intro, ...script.featureCallouts.slice(0, 2), script.outro]
      .map((s) => s?.trim())
      .filter(Boolean) as string[];
    const roomPhotos = photos.slice(0, HYPE_REEL_ROOMS);
    // Shorter clips for the punchy hype-reel rhythm.
    const allClips = await fireBeatClips({
      lookId,
      wardrobe,
      listing,
      exterior: hero,
      roomPhotos,
      openerSec: 6,
      roomSec: 8,
      closerSec: 6,
    });

    await supabase.from("videos").update({
      heygen_video_id: encodeReelJobs("", "", allClips),
      status: "processing",
      thumbnail_url: hero,
      script_segments: {
        hypeReel: {
          featureCallouts: script.featureCallouts,
          trackId: trackId ?? "default",
        },
        beats,
        captions,
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
    const seg = video.script_segments as {
      hypeReel?: { featureCallouts?: string[]; trackId?: string };
      beats?: string[];
      lipsync?: string;
      captions?: boolean;
    } | null;
    const meta = seg?.hypeReel;
    const { data: avReel } = await supabase
      .from("avatars")
      .select("voice_id")
      .eq("id", video.avatar_id ?? "")
      .maybeSingle();
    await assembleHypeReel(supabase, {
      id: video.id,
      user_id: video.user_id,
      heygen_video_id: video.heygen_video_id,
      photos,
      facts: reelFacts(pollListing),
      featureCallouts: meta?.featureCallouts ?? [],
      trackId: meta?.trackId ?? null,
      beats: seg?.beats ?? null,
      lipsync: seg?.lipsync ?? null,
      captions: seg?.captions ?? true,
      voiceId: avReel?.voice_id ?? null,
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
        beats:
          (video.script_segments as { beats?: string[] } | null)?.beats ?? null,
        lipsync:
          (video.script_segments as { lipsync?: string } | null)?.lipsync ?? null,
        captions:
          (video.script_segments as { captions?: boolean } | null)?.captions ??
          true,
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

/** Delete a video (RLS scopes it to the owner). Used to clean up test/junk reels.
 * The client handles navigation/refresh (no redirect here). */
export async function deleteVideo(videoId: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("videos").delete().eq("id", videoId);
  revalidatePath("/videos");
}

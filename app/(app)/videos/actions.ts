"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import {
  generateHypeReelScript,
  generateOpeningPitch,
  generateRoomNarration,
  type ReelStyle,
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
import { assembleAiReel, isAiReel } from "@/lib/video/ai-reel";
import { isMock } from "@/lib/heygen/client";
import { listingPhotos, tourPhotosFor } from "@/lib/format";
import { wardrobePrompt, tuckClause } from "@/lib/video/wardrobe";
import type { Json, Tables } from "@/lib/types/database";

/** Hard cap on AI room clips per cinematic walkthrough (one Seedance clip per
 * listing photo). The agent picks how many within this; caps cost/render time. */
const MAX_CINEMATIC_ROOMS = 12;
const DEFAULT_CINEMATIC_ROOMS = 2;
/** AI room clips in a Hype Reel's middle tour (between the host bookends). Must
 * match ROOM_PHOTO_SHOTS in lib/video/hypereel.ts (beat-synced durations). */
const HYPE_REEL_ROOMS = 2;

/**
 * First sentence of a script, capped to `maxWords` — the SHORT spoken line a TWIN
 * bookend clip is lip-synced to. Long bookend lines make the spoken audio far longer
 * than the ≤15s clip, which HeyGen lipsync rejects (>15% length mismatch).
 */
function shortLine(text: string, maxWords = 16): string {
  const first = (text.split(/(?<=[.!?])\s+/)[0] || text).trim();
  const w = first.split(/\s+/).filter(Boolean);
  return w.length > maxWords ? w.slice(0, maxWords).join(" ") : first;
}

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

  // The editable box is the ~20s OPENING PITCH (not the full walkthrough — that
  // was overstuffing it to ~60s). Smaller Claude call → faster redirect too.
  const pitch = await generateOpeningPitch(listing as Tables<"listings">);

  await supabase
    .from("videos")
    .update({ script: pitch, status: "script_ready" })
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
 * Regenerate the ~20s opening pitch with Claude (to spec, length-calibrated) and
 * save it. Returns the new pitch so the client can update the editor in place.
 */
export async function rewriteOpeningPitch(
  videoId: string,
): Promise<{ pitch?: string; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("listing_id")
    .eq("id", videoId)
    .maybeSingle();
  if (!video?.listing_id) return { error: "No listing for this video." };
  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", video.listing_id)
    .maybeSingle();
  if (!listing) return { error: "Listing not found." };

  const pitch = await generateOpeningPitch(listing as Tables<"listings">);
  await supabase.from("videos").update({ script: pitch }).eq("id", videoId);
  revalidatePath(`/videos/${videoId}`);
  return { pitch };
}

/**
 * Save THIS video's tour order — an ordered selection drawn from the listing's
 * photos. Photo order IS the tour sequence: first = opening (front exterior) clip,
 * last = closing clip, interiors between = the room walk. Stored on the VIDEO
 * (`script_segments.tourPhotos`), NOT the listing — so the listing keeps its full
 * photo pool, deleting just removes a photo from this tour, and "add" pulls back any
 * listing photo. The generate flow reads this order (falling back to all photos).
 */
export async function saveTourOrder(
  videoId: string,
  orderedUrls: string[],
): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  if (orderedUrls.length === 0) return { error: "Keep at least one photo." };
  const { data: video } = await supabase
    .from("videos")
    .select("script_segments")
    .eq("id", videoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!video) return { error: "Video not found." };
  const seg = (video.script_segments as Record<string, unknown> | null) ?? {};
  const { error } = await supabase
    .from("videos")
    .update({ script_segments: { ...seg, tourPhotos: orderedUrls } as Json })
    .eq("id", videoId)
    .eq("user_id", userId);
  if (error) return { error: error.message };
  revalidatePath(`/videos/${videoId}`);
  return { ok: true };
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
/**
 * Motion brief for the EXTERIOR opener/closer Seedance shot — the LIP-SYNC ANCHOR.
 * Unlike the room walkthroughs (which read as voice-over over cinematic motion),
 * these front-of-house shots hold a clear, front-facing, actively-speaking face so
 * HeyGen lipsync detects a speaker and syncs the mouth on these beats. Without at
 * least one detectable speaking face in the montage, lipsync errors ("no speaker
 * detected") and the whole reel falls back to voice-over-only.
 */
function cinematicExteriorPrompt(
  listing: Tables<"listings"> | null,
  kind: "intro" | "closer",
  wardrobe: string,
): string {
  const place = listing?.address ? `the home at ${listing.address}` : "this home";
  // Opener = FRONT of the house; closer = the BACKYARD (each recreated faithfully
  // from its OWN reference photo — they are different areas, so don't force a match).
  const scene =
    kind === "intro"
      ? "Recreate the house FRONT EXTERIOR in the reference image EXACTLY and faithfully: the same architecture, materials, roof, windows, and the front yard — lawn, landscaping, walkway and driveway, in the same positions. Do not invent or rearrange."
      : "Recreate the BACKYARD / rear outdoor space in the reference image EXACTLY and faithfully: the same patio or deck, yard and landscaping, pool or fire-pit if present, fencing and structures, in the same positions. Do not invent or rearrange.";
  return [
    "Bright, crisp, high-energy vertical 9:16 real-estate tour shot filmed on a smooth",
    "gimbal — clean natural daylight, sharp with everything in focus, true-to-life color.",
    "NOT a moody cinematic film: no shallow-depth blur, no film grain, no heavy grade.",
    "Polished but real, like a top agent's viral social tour.",
    scene,
    `${kind === "intro" ? `In front of ${place}` : `In the backyard of ${place}`}, a confident, charismatic, ANIMATED real-estate agent ${wardrobe}`,
    kind === "intro"
      ? "OPENS facing the camera directly and SPEAKING a warm, welcoming greeting to the viewer, with a brief gesture toward the home."
      : "faces the camera directly and SPEAKS a warm closing invitation to the viewer, with an open gesture toward the backyard.",
    // Being FILMED by a videographer — NOT a phone selfie. Both hands free.
    "The agent is being professionally FILMED by a separate camera operator — NOT a",
    "selfie: both hands are FREE to gesture, the agent is NOT holding a phone, camera",
    "or any device, and no arm is extended toward the lens.",
    // LIP-SYNC ANCHOR: this opener/closer shot must hold a clear, detectable
    // speaking face so HeyGen lipsync can sync the mouth on this beat (the room
    // walkthroughs are voice-over only). Frame the face large, centered, lit.
    "Frame as a flattering MEDIUM CLOSE-UP — the agent's head and shoulders large",
    "and centered, FACE FULLY VISIBLE and in sharp focus, eyes to the lens,",
    "well-lit. The agent is ACTIVELY TALKING to the camera, mouth moving naturally",
    "as if mid-sentence, for the ENTIRE shot. Keep the face toward camera the whole",
    "time — never turn away, walk out of frame, or let anything obscure the face.",
    // Single subject, cinematic camera that keeps the face framed.
    "EXACTLY ONE person in frame — the agent, alone. No other people, bystanders,",
    "background figures or crowds.",
    "Camera: a slow, subtle push-in on a gimbal that keeps the agent's face",
    "centered and clearly framed throughout; steady, premium, magazine-quality.",
    `The SAME person in the SAME outfit (${wardrobe}) — consistent throughout.`,
  ].join(" ");
}

/**
 * Derive exactly `count` short narration lines (one per room beat) from the
 * walkthrough script. Uses its photo-mapped segment lines, then pads from the
 * sentence stream so every room clip has something to lip-sync to.
 */
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
  tucked: boolean = true,
): { lookId: string; wardrobe: string } {
  const tuck = tuckClause(tucked, outfitId);
  return {
    lookId: avatar.heygen_avatar_id!,
    wardrobe: tuck ? `${wardrobePrompt(outfitId)}, with ${tuck}` : wardrobePrompt(outfitId),
  };
}

/**
 * Estimate a clip's length from its spoken narration (~2.5 words/sec) and clamp
 * to HeyGen's 4–15s cinematic_avatar range. Sizing each clip to its OWN beat is
 * what keeps the bookend lip-sync robust for any script: the clip and its
 * narration match, so HeyGen accepts the lipsync (the assembler only has to
 * pad/speed-fit the small residual). Over-long beats cap at 15s and the assembler
 * speed-fits the narration into them.
 */
function estClipSec(text: string): number {
  const words = (text || "").trim().split(/\s+/).filter(Boolean).length;
  return Math.min(15, Math.max(4, Math.round(words / 2.5)));
}

/**
 * Fire the silent cinematic_avatar beat clips shared by BOTH video paths:
 * exterior opener + one room clip per photo + backyard closer, all the real twin
 * in the chosen outfit. Each clip's duration is DYNAMIC to its beat narration
 * (`beats` is 1:1 with the clips). Returns the clip ids in playback order.
 */
/**
 * Fire ONLY the two TWIN bookend clips — the agent talking to camera in front of the
 * house (opener) and in the backyard (closer). The room-walk is no longer AI-rendered:
 * the b-roll is Ken-Burns pans over the REAL listing photos (faithful, fast, cheap),
 * assembled later. Returns the two clip job ids.
 */
async function fireBookendClips(opts: {
  lookId: string;
  wardrobe: string;
  listing: Tables<"listings"> | null;
  exterior: string;
  /** Closer reference — the BACKYARD photo (falls back to the exterior). */
  backyard?: string;
  openerBeat: string;
  closerBeat: string;
}): Promise<{ opener: string; closer: string }> {
  const { lookId, wardrobe, listing, exterior, openerBeat, closerBeat } = opts;
  const backyard = opts.backyard || exterior;
  const [opener, closer] = await Promise.all([
    generateCinematicClip({
      avatarLookId: lookId,
      referenceUrl: exterior,
      prompt: cinematicExteriorPrompt(listing, "intro", wardrobe),
      duration: estClipSec(openerBeat),
    }),
    generateCinematicClip({
      avatarLookId: lookId,
      referenceUrl: backyard,
      prompt: cinematicExteriorPrompt(listing, "closer", wardrobe),
      duration: estClipSec(closerBeat),
    }),
  ]);
  return { opener: opener.jobId, closer: closer.jobId };
}

export async function submitCinematicVideo(
  videoId: string,
  outfitId?: string,
  roomCount?: number,
  captions: boolean = false,
  tucked: boolean = true,
  style: ReelStyle = "classic",
  roomWords: number = 14,
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

  const photos = tourPhotosFor(video.script_segments, listing?.photos);
  if (photos.length === 0) {
    return fail("Add listing photos to generate a cinematic walkthrough.");
  }
  // Rooms = the INTERIOR photos, between the front-exterior opener (photos[0]) and
  // the backyard closer (last photo), so each room clip is a distinct actual room —
  // not a repeat of the bookends. Capped by the agent's chosen count.
  const roomPhotos = photos.slice(1, Math.max(1, photos.length - 1)).slice(0, rooms);

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    // CINEMATIC AVATAR + LIPSYNC pipeline (one clean path):
    //   per beat:  cinematic_avatar clip (silent, keeps likeness)
    //   later:     cloned-voice TTS  ->  Lipsync-Precision onto the clip
    // Result: the real twin walking/presenting through the home, TALKING in
    // their own voice, lip-synced. Beats = exterior opener + each room +
    // exterior closer. Here we just fire the (silent) clips and store the
    // per-beat scripts; the assembler does TTS + lipsync + stitch.
    const { lookId, wardrobe } = resolveLook(avatar, outfitId, tucked);
    const exterior = photos[0];
    // Gen-Z mode regenerates the opener in-style (the editable pitch is the classic
    // voice); classic uses the user's edited pitch.
    const openingPitch =
      style === "genz"
        ? await generateOpeningPitch(listing as Tables<"listings">, "genz")
        : video.script?.trim() || "Welcome — let me show you this beautiful home.";
    // Room narration is VISION-based: Claude looks at each room photo and writes
    // that room's line, so the agent talks about the actual space on screen (no
    // text written by the user). The opening pitch (front) + CTA bookend it.
    const [hook, roomLines] = await Promise.all([
      generateHypeReelScript(listing as Tables<"listings">),
      generateRoomNarration(
        roomPhotos,
        listing as Tables<"listings">,
        openingPitch,
        style,
        roomWords,
      ),
    ]);
    const cta =
      style === "genz"
        ? "Okay this one is straight-up elite — DM me right now before it's gone!"
        : hook.outro?.trim() || "Reach out today to see it in person.";

    // The opener BOOKEND is lip-synced to a SHORT spoken line (~1 sentence) — a long
    // opener makes the spoken slice far exceed the clip and HeyGen lipsync rejects the
    // >15% mismatch. The full pitch still seeds the room narration as context.
    const openerBeat = shortLine(openingPitch, 16);
    // Beats order is [opener, ...rooms, closer]. Closer bookend = the backyard.
    const beats = [openerBeat, ...roomLines, cta];
    const backyard = photos[photos.length - 1] ?? exterior;
    // Only the two TWIN bookends are AI-rendered; the rooms are Ken-Burns pans over
    // the real photos, assembled from script_segments.roomPhotos.
    const { opener, closer } = await fireBookendClips({
      lookId,
      wardrobe,
      listing,
      exterior,
      backyard,
      openerBeat,
      closerBeat: cta,
    });

    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs(opener, closer, []),
        status: "processing",
        thumbnail_url: photos[0] ?? null,
        script_segments: { beats, captions, roomPhotos } as unknown as Json,
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
  captions: boolean = false,
  tucked: boolean = true,
  style: ReelStyle = "classic",
  roomWords: number = 14,
  roomCount: number = HYPE_REEL_ROOMS,
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
  const photos = tourPhotosFor(video.script_segments, listing?.photos);
  if (photos.length === 0) return fail("Add listing photos to generate a Hype Reel.");
  const hero = photos[0];

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    // SAME pipeline as the cinematic walkthrough (cinematic_avatar + Lipsync-
    // Precision → the twin TALKING in their own voice), just with MUSIC built in.
    // Punchy short script so it lands ~15s.
    const { lookId, wardrobe } = resolveLook(avatar, outfitId, tucked);
    // Interior rooms only (skip the front-exterior opener + backyard closer),
    // capped to the chosen room count.
    const rooms = Math.min(Math.max(1, Math.round(roomCount)), MAX_CINEMATIC_ROOMS);
    const roomPhotos = photos
      .slice(1, Math.max(1, photos.length - 1))
      .slice(0, rooms);
    // Same vision-based room narration as cinematic — the agent talks about each
    // actual room — bookended by the punchy hype intro + outro.
    const script = await generateHypeReelScript(listing as Tables<"listings">);
    // Keep the hype intro PUNCHY (~5s) — a short Gen-Z hook, not the full ~20s pitch.
    const intro =
      style === "genz"
        ? "Yo — you are NOT ready for this house. Watch this."
        : script.intro;
    const outro =
      style === "genz"
        ? "This one's NOT staying on the market — DM me, let's go!"
        : script.outro;
    const roomLines = await generateRoomNarration(
      roomPhotos,
      listing as Tables<"listings">,
      intro,
      style,
      roomWords,
    );
    // Bookend lines stay SHORT (≤1 sentence) so the lip-sync clip ↔ audio lengths match.
    const beats = [shortLine(intro), ...roomLines, shortLine(outro)]
      .map((s) => s?.trim())
      .filter(Boolean) as string[];
    const backyard = photos[photos.length - 1] ?? hero; // closer = backyard
    // Only the two TWIN bookends are AI-rendered; rooms are Ken-Burns pans over the
    // real photos (script_segments.roomPhotos), with music ducked under in the final pass.
    const { opener, closer } = await fireBookendClips({
      lookId,
      wardrobe,
      listing,
      exterior: hero,
      backyard,
      openerBeat: beats[0] ?? intro,
      closerBeat: beats[beats.length - 1] ?? outro,
    });

    await supabase.from("videos").update({
      heygen_video_id: encodeReelJobs(opener, closer, []),
      status: "processing",
      thumbnail_url: hero,
      script_segments: {
        hypeReel: {
          featureCallouts: script.featureCallouts,
          trackId: trackId ?? "default",
        },
        beats,
        captions,
        roomPhotos,
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
  let { data: video } = await supabase
    .from("videos")
    .select("*, listings(*)")
    .eq("id", videoId)
    .single();
  if (!video) return null;

  // Self-heal a stale `submitting` lock. An assembly run claims the job
  // (processing → submitting) before the heavy stitch/lipsync step; if that run
  // dies (page closed mid-stitch, or the function is killed), the row stays
  // `submitting` forever — the assemblers only re-claim `processing` rows, so it
  // sits stuck. The updated_at trigger stamps the claim time; if it's been
  // submitting longer than any real assembly step, reset it to `processing` so
  // this poll can re-drive it to completion.
  if (
    video.status === "submitting" &&
    (isHypeReel(video.heygen_video_id) ||
      isCinematic(video.heygen_video_id) ||
      isAiReel(video.heygen_video_id))
  ) {
    const claimedMs = video.updated_at ? Date.parse(video.updated_at) : 0;
    const STALE_SUBMIT_MS = 4 * 60 * 1000; // > any real stitch, < the 5-min fn limit
    if (Date.now() - claimedMs > STALE_SUBMIT_MS) {
      const { data: reset } = await supabase
        .from("videos")
        .update({ status: "processing" })
        .eq("id", videoId)
        .eq("status", "submitting")
        .select("*, listings(*)")
        .single();
      if (reset) video = reset;
    }
  }

  const pollListing = video.listings as Tables<"listings"> | null;
  const photos = pollListing ? listingPhotos(pollListing.photos).map((p) => p.url) : [];

  // Runway + ElevenLabs reel: render any missing scene clips, then narrate + stitch.
  if (isAiReel(video.heygen_video_id) && video.status === "processing") {
    await assembleAiReel(supabase, video);
    const { data: latest } = await supabase
      .from("videos").select("*").eq("id", videoId).single();
    return latest ?? video;
  }

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
      captions: seg?.captions ?? false,
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
        captions:
          (video.script_segments as { captions?: boolean } | null)?.captions ??
          false,
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

/**
 * Retry a FAILED cinematic/hype reel by REUSING its already-rendered clips —
 * just reset it to `processing` (clear the error) so the poll/cron re-drives the
 * assembly from where it left off (re-stitch, or resume at the lipsync if that
 * already fired). No new clip generation, so no extra HeyGen clip credits. This
 * is the recovery path for transient assembly failures (e.g. ENOSPC). Returns
 * the refreshed row. Falls back to a no-op if the clips themselves are gone.
 */
export async function retryVideo(
  videoId: string,
): Promise<Tables<"videos"> | null> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("heygen_video_id, script_segments")
    .eq("id", videoId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!video) return null;
  // Only the clip-based reels can resume from existing clips.
  if (!isCinematic(video.heygen_video_id) && !isHypeReel(video.heygen_video_id)) {
    return null;
  }
  // Clear prior lipsync/VO state so a retry re-fires the bookend lipsyncs fresh
  // (don't re-poll dead ids). Keep beats/hypeReel/captions. Clips untouched.
  const seg = (video.script_segments as Record<string, unknown> | null) ?? {};
  const {
    lipsync: _l,
    narration: _n,
    lipsyncs: _ls,
    narrations: _ns,
    montageUrl: _mu,
    montageNarration: _mn,
    lipOpener: _lo,
    lipCloser: _lc,
    roomNarration: _rn,
    roomPerClipMs: _rp,
    openerNarration: _on,
    closerNarration: _cn,
    ...keepSeg
  } = seg;
  // Reset and return immediately — the client's poll loop drives the assembly,
  // so the UI flips to the "generating" state right away (no inline wait here).
  const { data: latest } = await supabase
    .from("videos")
    .update({
      status: "processing",
      error: null,
      script_segments: keepSeg as never,
    })
    .eq("id", videoId)
    .eq("user_id", userId)
    .select("*")
    .single();
  revalidatePath(`/videos/${videoId}`);
  return latest ?? null;
}

/** Delete a video (RLS scopes it to the owner). Used to clean up test/junk reels.
 * The client handles navigation/refresh (no redirect here). */
export async function deleteVideo(videoId: string) {
  await requireUser();
  const supabase = await createClient();
  await supabase.from("videos").delete().eq("id", videoId);
  revalidatePath("/videos");
}

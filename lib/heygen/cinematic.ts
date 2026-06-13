import "server-only";
import { ENDPOINTS, heygenFetch, isMock, MOCK_VIDEO_URL } from "./client";

/**
 * HeyGen Cinematic Avatar (Seedance "Avatar Shots"): places a CONSENT-VERIFIED
 * digital twin inside generated footage with full-body motion — the twin appears
 * to move through a scene rather than presenting over a still photo. Each shot is
 * 4–15s, so a walkthrough = several clips stitched together (see lib/video/stitch).
 *
 * Validated live: POST /v3/videos { type:"cinematic_avatar", avatar_id:[lookId],
 * prompt, references:[{type:"url",url}], duration, resolution, aspect_ratio }.
 * Requires a consent-validated twin (otherwise 400 "does not have validated
 * consent") — see startTwinConsent in lib/heygen/avatar.ts.
 */
export async function generateCinematicClip(input: {
  avatarLookId: string;
  /** Reference image (a listing photo) that steers the scene/composition. */
  referenceUrl?: string;
  /** Natural-language shot brief: the motion, framing, mood. */
  prompt: string;
  /** 4–15s (default 10). */
  duration?: number;
}): Promise<{ jobId: string }> {
  if (isMock) {
    const seed = Math.abs(hash(input.prompt)).toString(36);
    return { jobId: `mock_cine_${seed}` };
  }
  const body: Record<string, unknown> = {
    type: "cinematic_avatar",
    avatar_id: [input.avatarLookId],
    prompt: input.prompt,
    duration: Math.min(15, Math.max(4, input.duration ?? 10)),
    resolution: "720p",
    aspect_ratio: "9:16",
  };
  if (input.referenceUrl) {
    body.references = [{ type: "url", url: input.referenceUrl }];
  }
  const res = await heygenFetch<{ data: { video_id: string } }>(
    ENDPOINTS.generateVideoV3,
    { method: "POST", json: body },
  );
  return { jobId: res.data.video_id };
}

/**
 * HeyGen v3 avatar talking-head (`type:"avatar"`): the IDENTITY-LOCKED twin
 * (avatar_id = the real twin look — the same identity the Seedance room walk
 * uses, so it actually looks like the user) lip-syncs the cloned voice over a
 * still IMAGE background. We pass a heavily-BLURRED listing-room photo as that
 * background → a portrait/shallow-focus "twin in the room, focused on the face"
 * talking bookend, with no double-twin (the blurred photo has no person).
 *
 * Shape verified live: { type:"avatar", avatar_id, script, voice_id,
 * background:{type:"image"|"color", url}, resolution, aspect_ratio }. v3 avatar
 * backgrounds support color/image only (NOT video). Poll via
 * getCinematicClipStatus (any v3 video).
 */
export async function generateAvatarTalkingVideo(input: {
  /** The real twin look id (identity-locked). */
  avatarId: string;
  script: string;
  voiceId: string;
  /** Public/signed URL of the (blurred) room image shown behind the twin. */
  backgroundImageUrl: string;
}): Promise<{ jobId: string }> {
  if (isMock) {
    const seed = Math.abs(hash(input.script)).toString(36);
    return { jobId: `mock_avtalk_${seed}` };
  }
  const res = await heygenFetch<{ data: { video_id: string } }>(
    ENDPOINTS.generateVideoV3,
    {
      method: "POST",
      json: {
        type: "avatar",
        avatar_id: input.avatarId,
        // Avatar V engine: same look id as the Seedance walk → same outfit, and
        // unlike the default Avatar IV it accepts motion_prompt (presenter pose
        // direction). Our twin look lists avatar_v in supported_api_engines.
        engine: { type: "avatar_v" },
        script: input.script,
        voice_id: input.voiceId,
        // Direct a grounded, premium presenter standing in front of the house.
        motion_prompt:
          "Standing confidently in front of the home, calm premium presenter " +
          "energy: subtle weight shift, an occasional open-hand gesture toward " +
          "the property, steady eye contact with the camera. Minimal, grounded " +
          "movement.",
        // Matte the twin out of its training background and composite it OVER
        // the (front-of-house) photo — "the agent standing in front of the
        // house." Requires the twin to be trained with matting.
        remove_background: true,
        // 'contain' fits the whole subject in frame (pulled back, tripod-style)
        // instead of 'cover' which crops in tight ("too up close").
        fit: "contain",
        background: { type: "image", url: input.backgroundImageUrl },
        resolution: "720p",
        aspect_ratio: "9:16",
      },
    },
  );
  return { jobId: res.data.video_id };
}

export interface CinematicClipStatus {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

/** Poll one cinematic clip job (v3 video). */
export async function getCinematicClipStatus(
  jobId: string,
): Promise<CinematicClipStatus> {
  if (isMock) return { status: "completed", videoUrl: MOCK_VIDEO_URL };
  const res = await heygenFetch<{
    data?: {
      status?: string;
      video_url?: string;
      video_url_caption?: string;
      error?: { message?: string } | string;
    };
  }>(ENDPOINTS.videoStatusV3(jobId));
  const d = res.data ?? {};
  const status =
    d.status === "completed" || d.status === "success"
      ? "completed"
      : d.status === "failed" || d.status === "error"
        ? "failed"
        : "processing";
  return {
    status,
    videoUrl: d.video_url,
    error:
      typeof d.error === "string" ? d.error : (d.error?.message ?? undefined),
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

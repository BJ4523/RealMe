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
 * HeyGen v3 photo-to-video (`type:"image"`): animates an ENTIRE still frame into
 * a talking video — the person and the scene are one generated shot (no cutout
 * compositing). We feed it a frame from a finished Seedance room clip (the twin
 * standing in the AI room, selected outfit) + the cloned voice, producing the
 * lip-synced "talking in the house" bookends. Shape verified live:
 * { type:"image", image:{type:"url"|"asset_id"|"base64"}, script, voice_id,
 *   resolution, aspect_ratio }. Poll with getCinematicClipStatus (any v3 video).
 */
export async function generateImageTalkingVideo(input: {
  /** Public/signed URL of the frame to animate (the twin in the AI room). */
  imageUrl: string;
  script: string;
  voiceId: string;
}): Promise<{ jobId: string }> {
  if (isMock) {
    const seed = Math.abs(hash(input.script)).toString(36);
    return { jobId: `mock_imgtalk_${seed}` };
  }
  const res = await heygenFetch<{ data: { video_id: string } }>(
    ENDPOINTS.generateVideoV3,
    {
      method: "POST",
      json: {
        type: "image",
        image: { type: "url", url: input.imageUrl },
        script: input.script,
        voice_id: input.voiceId,
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

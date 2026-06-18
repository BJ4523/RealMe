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
    resolution: "1080p",
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
  let res: {
    data?: {
      status?: string;
      video_url?: string;
      video_url_caption?: string;
      error?: { message?: string } | string;
    };
  };
  try {
    res = await heygenFetch(ENDPOINTS.videoStatusV3(jobId));
  } catch {
    // HeyGen sometimes 500s ("internal_error") on a lookup for a clip that's actually
    // fine. heygenFetch throws on non-200, which would otherwise FAIL the whole video
    // — instead treat a transient lookup error as "still processing" so the next
    // poll/cron retries. (A genuinely failed clip reports status:"failed" in the body.)
    return { status: "processing" };
  }
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

import "server-only";
import { ENDPOINTS, heygenFetch, isMock, MOCK_VIDEO_URL } from "./client";
import { getCinematicClipStatus } from "./cinematic";

/**
 * HeyGen Video Agent (`POST /v3/video-agents`): a prompt-driven, agentic
 * talking-avatar composer. Given a prompt + our twin `avatar_id` + cloned
 * `voice_id` + reference `files` (e.g. the exterior photo), it scripts, composes
 * the scene, and renders a LIP-SYNCED video. Two-stage: create a session, then
 * the session yields a `video_id` once rendering begins → poll that video.
 *
 * Shapes verified live: POST returns { session_id, status, video_id:null };
 * GET /v3/video-agents/{id} returns { session_id, status:generating|completed|
 * failed, video_id (nullable) }. NOTE: jobs routinely take ~20-45 minutes.
 */
export async function createVideoAgentSession(input: {
  prompt: string;
  avatarId: string;
  voiceId: string;
  /** Reference files (e.g. the exterior photo) the agent composes around. */
  fileUrls?: string[];
  orientation?: "portrait" | "landscape";
}): Promise<{ sessionId: string }> {
  if (isMock) {
    return { sessionId: `mock_va_${Math.abs(hash(input.prompt)).toString(36)}` };
  }
  const res = await heygenFetch<{ data: { session_id: string } }>(
    ENDPOINTS.videoAgents,
    {
      method: "POST",
      json: {
        prompt: input.prompt,
        avatar_id: input.avatarId,
        voice_id: input.voiceId,
        orientation: input.orientation ?? "portrait",
        ...(input.fileUrls?.length
          ? { files: input.fileUrls.map((url) => ({ type: "url", url })) }
          : {}),
      },
    },
  );
  return { sessionId: res.data.session_id };
}

export interface VideoAgentResult {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

/**
 * Resolve a Video Agent session to a finished video in one call: poll the
 * session for its `video_id`, then poll that video for its URL. Returns
 * "processing" until the final video is ready. Stateless — safe to call on every
 * poll (the session keeps returning the same video_id once assigned).
 */
export async function resolveVideoAgent(
  sessionId: string,
): Promise<VideoAgentResult> {
  if (isMock) return { status: "completed", videoUrl: MOCK_VIDEO_URL };
  let session: { status?: string; video_id?: string | null };
  try {
    const res = await heygenFetch<{
      data?: { status?: string; video_id?: string | null };
    }>(ENDPOINTS.videoAgentSession(sessionId));
    session = res.data ?? {};
  } catch (e) {
    return { status: "processing", error: e instanceof Error ? e.message : undefined };
  }
  if (session.status === "failed") {
    return { status: "failed", error: "The Video Agent session failed." };
  }
  if (!session.video_id) return { status: "processing" };
  // Once a video_id exists, it's a normal v3 video — reuse the clip poller.
  return getCinematicClipStatus(session.video_id);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

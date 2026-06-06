import "server-only";
import {
  DEFAULT_VOICE_ID,
  ENDPOINTS,
  heygenFetch,
  isMock,
  MOCK_VIDEO_URL,
} from "./client";
import type {
  GenerateVideoInput,
  GenerateVideoResult,
  VideoStatusResult,
} from "./types";

/**
 * Submit an avatar + script video generation job.
 * Async: returns a videoId immediately; completion arrives via webhook
 * (real) or is simulated by getVideoStatus after a short delay (mock).
 */
export async function generateVideo(
  input: GenerateVideoInput,
): Promise<GenerateVideoResult> {
  if (isMock) {
    return {
      videoId: `mock_video_${Math.abs(hashString(input.script)).toString(36)}_${input.avatarId.slice(-4)}`,
      status: "processing",
    };
  }

  // --- Real path ---
  // Avatars are created as talking photos (see lib/heygen/avatar.ts), so the
  // agent's cloned (or fallback) voice reads the AI-written script.
  const body = {
    video_inputs: [
      {
        character: {
          type: "talking_photo",
          talking_photo_id: input.avatarId,
          scale: 1,
        },
        voice: {
          type: "text",
          input_text: input.script,
          voice_id: input.voiceId ?? DEFAULT_VOICE_ID,
        },
        ...(input.photoUrls?.[0]
          ? { background: { type: "image", url: input.photoUrls[0] } }
          : {}),
      },
    ],
    dimension: { width: 1280, height: 720 },
    title: input.title,
    callback_url: input.webhookUrl,
  };

  const res = await heygenFetch<{ data: { video_id: string } }>(
    ENDPOINTS.generateVideo,
    { method: "POST", json: body },
  );
  return { videoId: res.data.video_id, status: "processing" };
}

export async function getVideoStatus(
  videoId: string,
  opts: { thumbnailUrl?: string } = {},
): Promise<VideoStatusResult> {
  if (isMock) {
    return {
      videoId,
      status: "completed",
      videoUrl: MOCK_VIDEO_URL,
      thumbnailUrl: opts.thumbnailUrl,
      duration: 62,
    };
  }

  const res = await heygenFetch<{
    data: {
      status: string;
      video_url?: string;
      thumbnail_url?: string;
      duration?: number;
      error?: { message?: string } | string;
    };
  }>(ENDPOINTS.videoStatus(videoId));

  const d = res.data;
  const status =
    d.status === "completed"
      ? "completed"
      : d.status === "failed"
        ? "failed"
        : d.status === "processing" || d.status === "pending"
          ? "processing"
          : "processing";

  return {
    videoId,
    status,
    videoUrl: d.video_url,
    thumbnailUrl: d.thumbnail_url ?? opts.thumbnailUrl,
    duration: d.duration,
    error:
      typeof d.error === "string" ? d.error : (d.error?.message ?? undefined),
  };
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

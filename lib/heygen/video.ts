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
  // MIGRATION (before 2026-10-31): this render uses the v2 endpoint
  // (POST /v2/video/generate). v2 is supported by HeyGen only THROUGH OCT 31,
  // 2026. We're on v2 because v3 (/v3/videos) has no multi-scene and won't
  // composite a background behind an avatar — so it can't do this walkthrough.
  // When HeyGen ships v3 multi-scene/background (or before the sunset), migrate
  // here. Twin CREATION already uses v3 (lib/heygen/avatar.ts) and is unaffected.
  //
  // Build a vertical (9:16) walkthrough: one scene per listing photo, the photo
  // full-frame in the background while the agent's avatar narrates as a cutout
  // overlay — a digital twin (matted) or a talking-photo circle, by kind.
  // Avatars are talking photos (see lib/heygen/avatar.ts); the cloned/fallback
  // voice reads the AI-written script, chunked across the photos in order.
  const photos = (input.photoUrls ?? []).filter(
    (u): u is string => typeof u === "string" && u.length > 0,
  );
  const usePhotos = photos.slice(0, MAX_SCENES);
  const voiceId = input.voiceId ?? DEFAULT_VOICE_ID;

  // Digital twins render as a realistic, background-removed cutout (matting)
  // composited over the listing photo; talking photos use the circle style.
  // Both are placed as a presenter in the lower-right of the 9:16 frame.
  const isTwin = input.avatarKind === "digital_twin";
  const presenter = () =>
    isTwin
      ? {
          type: "avatar" as const,
          avatar_id: input.avatarId,
          avatar_style: "normal" as const,
          matting: true,
          scale: 0.5,
          offset: { x: 0.28, y: 0.3 },
        }
      : {
          type: "talking_photo" as const,
          talking_photo_id: input.avatarId,
          talking_photo_style: "circle" as const,
          matting: true,
          scale: 0.42,
          offset: { x: 0.3, y: 0.34 },
        };
  const voiceFor = (text: string) => ({
    type: "text" as const,
    input_text: text,
    voice_id: voiceId,
  });

  type Scene = {
    character: ReturnType<typeof presenter>;
    voice: ReturnType<typeof voiceFor>;
    background?:
      | { type: "image"; url: string; fit: "cover" }
      | { type: "video"; url: string; play_style: "fit_to_scene" };
  };

  let scenes: Scene[];
  if (usePhotos.length <= 1) {
    scenes = [
      {
        character: presenter(),
        voice: voiceFor(input.script),
        ...(usePhotos[0]
          ? {
              background: {
                type: "image" as const,
                url: usePhotos[0],
                fit: "cover" as const,
              },
            }
          : {}),
      },
    ];
  } else {
    const chunks = splitScriptAcross(input.script, usePhotos.length);
    scenes = usePhotos
      .map((url, i) => ({
        character: presenter(),
        voice: voiceFor(chunks[i] ?? ""),
        background: { type: "image" as const, url, fit: "cover" as const },
      }))
      .filter((s) => s.voice.input_text.trim().length > 0);
  }

  const body = {
    video_inputs: scenes,
    dimension: { width: 720, height: 1280 },
    title: input.title,
    callback_url: input.webhookUrl,
  };

  const res = await heygenFetch<{ data: { video_id: string } }>(
    ENDPOINTS.generateVideo,
    { method: "POST", json: body },
  );
  return { videoId: res.data.video_id, status: "processing" };
}

/** Max walkthrough scenes (one per photo) to keep videos a reasonable length. */
const MAX_SCENES = 8;

/**
 * Split a narration script into `n` consecutive chunks aligned to sentence
 * boundaries, so each listing photo gets a roughly equal slice of narration.
 * If there are fewer sentences than photos, later chunks come back empty (those
 * scenes are dropped by the caller).
 */
function splitScriptAcross(script: string, n: number): string[] {
  const sentences = (script.match(/[^.!?]+[.!?]*/g) ?? [script])
    .map((s) => s.trim())
    .filter(Boolean);
  if (sentences.length <= n) {
    return Array.from({ length: n }, (_, i) => sentences[i] ?? "");
  }
  const per = Math.ceil(sentences.length / n);
  return Array.from({ length: n }, (_, i) =>
    sentences.slice(i * per, (i + 1) * per).join(" "),
  );
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

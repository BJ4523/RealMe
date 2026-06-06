import "server-only";
import { env } from "@/lib/env";

/**
 * Single source of truth for HeyGen connectivity.
 *
 * NOTE: HeyGen is mid-migration (v2 supported through Oct 31 2026; v3 active)
 * and its detailed request/response shapes are gated behind an interactive
 * playground. The endpoint strings below are the ONLY place to verify/pin
 * against live docs when switching off mock mode (HEYGEN_MOCK=0).
 */
export const HEYGEN_BASE = "https://api.heygen.com";
export const HEYGEN_UPLOAD_BASE = "https://upload.heygen.com";

export const ENDPOINTS = {
  // Verified against HeyGen docs/community (2025-2026). Re-confirm shapes with a
  // real key before a high-stakes demo — v2/v3 are both live during migration.
  uploadTalkingPhoto: `${HEYGEN_UPLOAD_BASE}/v1/talking_photo`,
  uploadAsset: `${HEYGEN_UPLOAD_BASE}/v1/asset`,
  voiceClone: `${HEYGEN_BASE}/v2/voices/clone`,
  listVoices: `${HEYGEN_BASE}/v2/voices`,
  generateVideo: `${HEYGEN_BASE}/v2/video/generate`,
  videoStatus: (id: string) =>
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${id}`,
} as const;

/**
 * Fallback stock voice (used when the agent doesn't clone a voice, or if
 * cloning fails). Override with HEYGEN_DEFAULT_VOICE_ID. Pick any id from
 * GET /v2/voices.
 */
export const DEFAULT_VOICE_ID =
  process.env.HEYGEN_DEFAULT_VOICE_ID ?? "1bd001e7e50f421d891986aad5158bc8";

export const isMock = env.heygenMock || env.heygenApiKey.length === 0;

type HeygenFetchInit = RequestInit & { json?: unknown };

/** Authenticated JSON fetch against the HeyGen REST API. */
export async function heygenFetch<T>(
  url: string,
  init: HeygenFetchInit = {},
): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(url, {
    ...rest,
    headers: {
      "X-Api-Key": env.heygenApiKey,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HeyGen ${res.status} ${url}: ${text.slice(0, 500)}`);
  }
  return (await res.json()) as T;
}

/** A stable sample MP4 used as the generated video in mock mode. */
export const MOCK_VIDEO_URL =
  "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4";

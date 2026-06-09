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
  // Lists the account's CUSTOM photo-avatar groups only (not stock avatars).
  listAvatarGroups: `${HEYGEN_BASE}/v2/avatar_group.list`,
  // The PHOTO avatar GROUP is what counts against the photo-avatar quota —
  // deleting the talking photo alone does NOT free a slot. For an app upload
  // the group id equals the talking_photo_id. Both verified live (→ 200).
  deleteAvatarGroup: (id: string) =>
    `${HEYGEN_BASE}/v2/photo_avatar_group/${id}`,
  deleteTalkingPhoto: (id: string) => `${HEYGEN_BASE}/v2/talking_photo/${id}`,
  generateVideo: `${HEYGEN_BASE}/v2/video/generate`,
  videoStatus: (id: string) =>
    `${HEYGEN_BASE}/v1/video_status.get?video_id=${id}`,

  // --- v3 (Digital Twin + Avatar IV) ---
  // Digital-twin CREATION is gated on v2 (/v2/video_avatar -> 403) but open on
  // v3 for this plan. Create from a 15-600s video; generate photorealistic 9:16
  // talking video with the avatar_iv engine. Verified live (POST -> 400/200, not 403).
  createAvatarV3: `${HEYGEN_BASE}/v3/avatars`,
  getAvatarV3: (id: string) => `${HEYGEN_BASE}/v3/avatars/${id}`,
  // Identity-consent for a twin GROUP. POST returns a HeyGen-hosted URL the
  // agent visits to record the consent video; GET the group reads consent_status.
  // Cinematic (Seedance Avatar Shots) requires a consent-validated twin.
  avatarConsent: (groupId: string) =>
    `${HEYGEN_BASE}/v3/avatars/${groupId}/consent`,
  listAvatarLooks: `${HEYGEN_BASE}/v3/avatars/looks`,
  generateVideoV3: `${HEYGEN_BASE}/v3/videos`,
  videoStatusV3: (id: string) => `${HEYGEN_BASE}/v3/videos/${id}`,
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

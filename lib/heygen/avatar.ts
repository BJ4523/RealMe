import "server-only";
import { ENDPOINTS, heygenFetch, isMock } from "./client";
import type { CreateAvatarResult, HeygenAvatarStatus } from "./types";

/**
 * Create a talking-photo avatar from an uploaded image.
 * Talking photos are usable in video generation immediately (no training wait).
 * In mock mode returns fake-but-stable ids and a "ready" status.
 */
export async function createAvatarFromAsset(input: {
  bytes: ArrayBuffer;
  contentType: string;
  name: string;
}): Promise<CreateAvatarResult> {
  if (isMock) {
    const seed = Math.abs(hashString(input.name)).toString(36);
    return {
      assetId: `mock_tp_${seed}`,
      avatarId: `mock_tp_${seed}`,
      status: "ready",
    };
  }

  // Upload the raw image; HeyGen returns a talking_photo_id we use directly.
  const res = await heygenFetch<{ data: { talking_photo_id: string } }>(
    ENDPOINTS.uploadTalkingPhoto,
    {
      method: "POST",
      headers: { "Content-Type": input.contentType || "image/jpeg" },
      body: input.bytes,
    },
  );
  const id = res.data.talking_photo_id;
  return { assetId: id, avatarId: id, status: "ready" };
}

/**
 * Clone the agent's voice from a short audio sample (instant voice clone).
 * Returns a voice_id, or null if cloning fails — callers fall back to a stock
 * voice so a video still renders. In mock mode returns a fake voice_id.
 */
export async function cloneVoiceFromAudio(input: {
  bytes: ArrayBuffer;
  contentType: string;
  name: string;
}): Promise<string | null> {
  if (isMock) {
    return `mock_voice_${Math.abs(hashString(input.name)).toString(36)}`;
  }

  try {
    // 1. Upload the audio sample → asset (id + url).
    const upload = await heygenFetch<{ data: { id: string; url?: string } }>(
      ENDPOINTS.uploadAsset,
      {
        method: "POST",
        headers: { "Content-Type": input.contentType || "audio/mpeg" },
        body: input.bytes,
      },
    );

    // 2. Request an instant clone. Shape varies by version — send the common
    //    fields and parse the voice id generously. VERIFY against live docs.
    const clone = await heygenFetch<{
      data?: { voice_id?: string; id?: string };
      voice_id?: string;
    }>(ENDPOINTS.voiceClone, {
      method: "POST",
      json: {
        name: input.name,
        sample_audio_url: upload.data.url,
        audio_asset_id: upload.data.id,
      },
    });

    return clone.data?.voice_id ?? clone.data?.id ?? clone.voice_id ?? null;
  } catch {
    return null;
  }
}

export async function getAvatarStatus(
  _avatarId: string,
): Promise<HeygenAvatarStatus> {
  // Talking photos are ready on upload.
  return "ready";
}

/**
 * Delete a HeyGen talking photo (frees a slot against the plan's photo-avatar
 * quota). Best-effort: returns false on any failure so callers never block the
 * primary flow on cleanup. No-op in mock mode.
 */
export async function deleteTalkingPhoto(
  id: string | null | undefined,
): Promise<boolean> {
  if (!id) return false;
  if (isMock) return true;
  try {
    await heygenFetch(ENDPOINTS.deleteTalkingPhoto(id), { method: "DELETE" });
    return true;
  } catch {
    return false;
  }
}

export interface CustomTalkingPhoto {
  id: string;
  name: string;
  previewUrl: string | null;
}

/**
 * List the account's CUSTOM talking photos for the admin cleanup view.
 *
 * HeyGen's avatar list mixes the account's uploads with thousands of stock
 * avatars and exposes no owner flag — the only signal is that API-uploaded
 * talking photos default to the name "Photo Avatar" (stock ones have real
 * names). This filter is therefore a heuristic; the preview thumbnail lets an
 * admin eyeball each before deleting.
 */
export async function listCustomTalkingPhotos(): Promise<CustomTalkingPhoto[]> {
  if (isMock) return [];
  const res = await heygenFetch<{
    data?: {
      talking_photos?: Array<{
        talking_photo_id: string;
        talking_photo_name?: string;
        preview_image_url?: string;
      }>;
    };
  }>(ENDPOINTS.listAvatars, { method: "GET" });

  return (res.data?.talking_photos ?? [])
    .filter((t) => (t.talking_photo_name ?? "") === "Photo Avatar")
    .map((t) => ({
      id: t.talking_photo_id,
      name: t.talking_photo_name ?? "Photo Avatar",
      previewUrl: t.preview_image_url ?? null,
    }));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

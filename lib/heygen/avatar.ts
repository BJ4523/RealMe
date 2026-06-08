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

export interface DigitalTwinResult {
  /** The look id — used as avatar_id when generating video. */
  lookId: string;
  /** The avatar-group id — used for status polling and deletion. */
  groupId: string;
  status: HeygenAvatarStatus;
}

/**
 * Create a HeyGen Digital Twin from a video of the person (v3). Gives a
 * photorealistic avatar that can later be composited over listing photos via
 * the v2 generate endpoint. Training is async — poll getDigitalTwinStatus.
 * `videoUrl` must be publicly fetchable (a Storage signed URL works); footage
 * must be 15-600s of real footage (HeyGen rejects AI-generated/synthetic video).
 */
export async function createDigitalTwin(input: {
  videoUrl: string;
  name: string;
}): Promise<DigitalTwinResult> {
  if (isMock) {
    const seed = Math.abs(hashString(input.name)).toString(36);
    return { lookId: `mock_twin_${seed}`, groupId: `mock_grp_${seed}`, status: "ready" };
  }

  const res = await heygenFetch<{
    data: {
      avatar_group: { id: string };
      avatar_item: { id: string; status?: string };
    };
  }>(ENDPOINTS.createAvatarV3, {
    method: "POST",
    json: {
      type: "digital_twin",
      name: input.name,
      file: { type: "url", url: input.videoUrl },
    },
  });

  return {
    lookId: res.data.avatar_item.id,
    groupId: res.data.avatar_group.id,
    status: normalizeTwinStatus(res.data.avatar_item.status),
  };
}

/**
 * Poll a digital twin's training status by its LOOK id. Note: the avatar-GROUP
 * status reports the upload ("completed") even when training of the look itself
 * failed — so we read the look's own status from the looks list.
 */
export async function getDigitalTwinStatus(
  lookId: string,
): Promise<HeygenAvatarStatus> {
  if (isMock) return "ready";
  try {
    const res = await heygenFetch<{
      data?: Array<{ id: string; status?: string }>;
    }>(`${ENDPOINTS.listAvatarLooks}?avatar_type=digital_twin`);
    const look = (res.data ?? []).find((l) => l.id === lookId);
    return normalizeTwinStatus(look?.status);
  } catch {
    return "processing";
  }
}

function normalizeTwinStatus(s: string | undefined): HeygenAvatarStatus {
  if (s === "ready" || s === "completed" || s === "success") return "ready";
  if (s === "failed" || s === "error") return "failed";
  return "processing";
}

/**
 * Delete a HeyGen photo avatar so it stops counting against the plan's
 * (account-wide) photo-avatar quota. The PHOTO avatar GROUP is what the quota
 * counts, so we delete the group; for an app upload the group id equals the
 * stored talking_photo_id. We also best-effort delete the talking photo entry.
 * Best-effort overall: returns false on failure so cleanup never blocks the
 * primary flow. No-op in mock mode.
 */
export async function deleteHeygenAvatar(
  id: string | null | undefined,
): Promise<boolean> {
  if (!id) return false;
  if (isMock) return true;
  let freed = false;
  try {
    await heygenFetch(ENDPOINTS.deleteAvatarGroup(id), { method: "DELETE" });
    freed = true;
  } catch {
    // group may not exist (id mismatch) — fall through to talking-photo delete
  }
  try {
    await heygenFetch(ENDPOINTS.deleteTalkingPhoto(id), { method: "DELETE" });
  } catch {
    // best-effort
  }
  return freed;
}

export interface CustomAvatar {
  id: string;
  name: string;
  previewUrl: string | null;
}

/**
 * List the account's CUSTOM photo-avatar groups for the admin cleanup view.
 * `avatar_group.list` returns ONLY the account's groups (no stock avatars), so
 * this is exact — unlike the talking-photos list, no name heuristic is needed.
 */
export async function listCustomAvatars(): Promise<CustomAvatar[]> {
  if (isMock) return [];
  const res = await heygenFetch<{
    data?: {
      avatar_group_list?: Array<{
        id: string;
        name?: string;
        preview_image?: string;
        group_type?: string;
      }>;
    };
  }>(ENDPOINTS.listAvatarGroups, { method: "GET" });

  return (res.data?.avatar_group_list ?? [])
    .filter((g) => (g.group_type ?? "") === "PHOTO")
    .map((g) => ({
      id: g.id,
      name: g.name ?? "Photo Avatar",
      previewUrl: g.preview_image ?? null,
    }));
}

function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  }
  return h;
}

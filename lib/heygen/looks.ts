import "server-only";
import { ENDPOINTS, heygenFetch, isMock } from "./client";

/**
 * Look generation for a digital-twin group, via the v3 unified avatar endpoint
 * (POST /v3/avatars, type:"prompt"). A "look" is a generated canonical image of
 * the twin (chosen outfit, face-on) attached to the existing twin identity. Its
 * id drives the Seedance room scenes (avatar_id) and its preview image drives
 * the talking bookends (photo-to-video) — one source, consistent everywhere.
 *
 * Shapes verified against the live OpenAPI spec at developers.heygen.com:
 * - POST /v3/avatars { type:"prompt", name, prompt, avatar_group_id,
 *     reference_images?:[{type:"url",url}] } -> { data:{ avatar_item:{ id }}}
 * - GET /v3/avatars/looks/{look_id} -> { data:{ status, preview_image_url }}
 * No separate "train photo model" step is needed (that was a v2 path).
 */

export type LookPhase = "processing" | "ready" | "failed";

function normalizeLookStatus(s: string | undefined): LookPhase {
  const v = (s ?? "").toLowerCase();
  if (["completed", "success", "ready"].includes(v)) return "ready";
  if (["failed", "error", "training_failed"].includes(v)) return "failed";
  return "processing";
}

/** Best-effort reference image of the twin (its first look's preview) for
 * likeness — reference_images only apply when attached to an avatar_group_id. */
export async function getTwinReferenceImage(
  groupId: string,
): Promise<string | null> {
  if (isMock) return null;
  try {
    const res = await heygenFetch<{
      data?: {
        avatar_list?: Array<{ preview_image_url?: string | null }>;
        looks?: Array<{ preview_image_url?: string | null }>;
      };
    }>(`${ENDPOINTS.listAvatarLooks}?group_id=${encodeURIComponent(groupId)}`);
    const looks = res.data?.avatar_list ?? res.data?.looks ?? [];
    return looks.find((l) => l?.preview_image_url)?.preview_image_url ?? null;
  } catch {
    return null;
  }
}

/** Start generating a canonical look (v3). Returns the look id immediately. */
export async function generateLook(input: {
  groupId: string;
  name: string;
  /** Outfit + setting brief; framing is appended for face detection. */
  prompt: string;
  referenceImageUrl?: string | null;
}): Promise<{ lookId: string }> {
  if (isMock) {
    return { lookId: `mock_look_${Math.abs(hash(input.prompt)).toString(36)}` };
  }
  const body: Record<string, unknown> = {
    type: "prompt",
    name: input.name.slice(0, 60),
    prompt:
      `${input.prompt}. Facing the camera directly, face clearly visible, ` +
      "warm professional smile, photorealistic, upper body centered in frame.",
    avatar_group_id: input.groupId,
  };
  if (input.referenceImageUrl) {
    body.reference_images = [{ type: "url", url: input.referenceImageUrl }];
  }
  const res = await heygenFetch<{ data?: { avatar_item?: { id?: string } } }>(
    ENDPOINTS.createAvatarV3,
    { method: "POST", json: body },
  );
  const lookId = res.data?.avatar_item?.id;
  if (!lookId) throw new Error("Look creation did not return a look id.");
  return { lookId };
}

export interface LookStatusResult {
  status: LookPhase;
  /** Canonical look image (drives the talking bookends) once ready. */
  imageUrl?: string;
  error?: string;
}

/** Poll a look's training/creation status (GET /v3/avatars/looks/{id}). */
export async function getLookStatus(lookId: string): Promise<LookStatusResult> {
  if (isMock) {
    return { status: "ready", imageUrl: "https://placehold.co/720x1280.jpg" };
  }
  try {
    const res = await heygenFetch<{
      data?: {
        status?: string;
        preview_image_url?: string | null;
        error?: string | { message?: string } | null;
      };
    }>(ENDPOINTS.avatarLookStatus(lookId));
    const d = res.data ?? {};
    const status = normalizeLookStatus(d.status);
    const error =
      typeof d.error === "string" ? d.error : (d.error?.message ?? undefined);
    return { status, imageUrl: d.preview_image_url ?? undefined, error };
  } catch (e) {
    return {
      status: "processing",
      error: e instanceof Error ? e.message : undefined,
    };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

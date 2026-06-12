import "server-only";
import { ENDPOINTS, heygenFetch, isMock } from "./client";

/**
 * Photo-avatar model training + look generation for a digital-twin group.
 * A "look" is a generated canonical image of the twin (chosen outfit, face-on)
 * that then drives BOTH the Seedance room scenes (avatar_id) and the talking
 * bookends (photo-to-video on the image) — one source image, consistent outfit
 * and reliable face everywhere.
 *
 * POST shapes verified live; GET status responses vary across HeyGen versions,
 * so they're normalized defensively (unknown -> "processing").
 */

export type LookPhase = "processing" | "ready" | "failed";

/** Kick off the one-time photo-model training for a twin group. */
export async function trainPhotoModel(groupId: string): Promise<void> {
  if (isMock) return;
  await heygenFetch(ENDPOINTS.trainPhotoModel, {
    method: "POST",
    json: { group_id: groupId },
  });
}

/** Poll model training. Treats "already trained"-style errors as ready. */
export async function getPhotoModelStatus(groupId: string): Promise<LookPhase> {
  if (isMock) return "ready";
  try {
    const res = await heygenFetch<{
      data?: { status?: string; train_status?: string };
    }>(ENDPOINTS.trainPhotoModelStatus(groupId));
    const s = (res.data?.status ?? res.data?.train_status ?? "").toLowerCase();
    if (["ready", "success", "completed", "trained"].includes(s)) return "ready";
    if (["failed", "error"].includes(s)) return "failed";
    return "processing";
  } catch (e) {
    // Some versions 400 with "already trained" when done.
    if (e instanceof Error && /already.*train/i.test(e.message)) return "ready";
    return "processing";
  }
}

/** Start generating a canonical look image. Returns the generation job id. */
export async function generateLook(input: {
  groupId: string;
  /** Outfit + setting brief; framing is appended for face detection. */
  prompt: string;
}): Promise<{ generationId: string }> {
  if (isMock) {
    return { generationId: `mock_lookgen_${Math.abs(hash(input.prompt)).toString(36)}` };
  }
  const res = await heygenFetch<{
    data?: { generation_id?: string; id?: string };
  }>(ENDPOINTS.generateLook, {
    method: "POST",
    json: {
      group_id: input.groupId,
      prompt:
        `${input.prompt}. Facing the camera directly, face clearly visible, ` +
        "warm professional smile, photorealistic, upper body centered in frame.",
      orientation: "vertical",
      pose: "half_body",
      style: "Realistic",
    },
  });
  const generationId = res.data?.generation_id ?? res.data?.id;
  if (!generationId) throw new Error("Look generation did not return an id.");
  return { generationId };
}

export interface LookGenerationResult {
  status: LookPhase;
  /** Generated look image (first of the batch) once ready. */
  imageUrl?: string;
  /** The look/image id usable as a Seedance avatar_id. */
  lookId?: string;
  error?: string;
}

/** Poll a look generation job; normalizes the id/image lists across versions. */
export async function getLookGeneration(
  generationId: string,
): Promise<LookGenerationResult> {
  if (isMock) {
    return {
      status: "ready",
      lookId: `mock_look_${generationId.slice(-6)}`,
      imageUrl: "https://placehold.co/720x1280.jpg",
    };
  }
  try {
    const res = await heygenFetch<{
      data?: {
        status?: string;
        image_url_list?: string[];
        image_key_list?: string[];
        id_list?: string[];
        image_urls?: string[];
        msg?: string;
        error?: string | { message?: string };
      };
    }>(ENDPOINTS.lookGenerationStatus(generationId));
    const d = res.data ?? {};
    const s = (d.status ?? "").toLowerCase();
    const imageUrl = d.image_url_list?.[0] ?? d.image_urls?.[0];
    const lookId = d.id_list?.[0] ?? d.image_key_list?.[0];
    if (["success", "completed", "ready"].includes(s)) {
      return { status: "ready", imageUrl, lookId };
    }
    if (["failed", "error"].includes(s)) {
      const error =
        typeof d.error === "string" ? d.error : (d.error?.message ?? d.msg);
      return { status: "failed", error: error ?? "Look generation failed." };
    }
    return { status: "processing", imageUrl, lookId };
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

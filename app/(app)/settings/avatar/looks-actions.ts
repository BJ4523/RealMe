"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  generateLook,
  getLookStatus,
  getTwinReferenceImage,
} from "@/lib/heygen/looks";
import { parseLooks, type LooksState } from "@/lib/avatars/looks-state";
import { WARDROBES } from "@/lib/video/wardrobe";
import type { Json } from "@/lib/types/database";

type ActionResult = { state?: LooksState; error?: string };

async function activeTwin(userId: string) {
  const supabase = await createClient();
  const { data: avatar } = await supabase
    .from("avatars")
    .select("id, heygen_asset_id, heygen_avatar_id, status, looks")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  const isTwin =
    !!avatar?.heygen_asset_id &&
    avatar.heygen_asset_id !== avatar.heygen_avatar_id;
  return { supabase, avatar, isTwin };
}

async function saveLooks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  avatarId: string,
  state: LooksState,
) {
  await supabase
    .from("avatars")
    .update({ looks: state as unknown as Json })
    .eq("id", avatarId);
}

/** Generate the canonical look image for one outfit (v3 prompt-avatar). */
export async function startLookGeneration(
  outfitId: string,
): Promise<ActionResult> {
  const { userId } = await requireUser();
  const { supabase, avatar, isTwin } = await activeTwin(userId);
  if (!avatar || !isTwin || avatar.status !== "ready") {
    return { error: "A ready digital twin is required first." };
  }
  const outfit = WARDROBES.find((w) => w.id === outfitId);
  if (!outfit) return { error: "Unknown outfit." };
  const state = parseLooks(avatar.looks);
  try {
    const referenceImageUrl = await getTwinReferenceImage(avatar.heygen_asset_id!);
    const { lookId } = await generateLook({
      groupId: avatar.heygen_asset_id!,
      name: outfit.label,
      prompt: `Standing in a bright, beautifully staged modern home interior, ${outfit.prompt}`,
      referenceImageUrl,
    });
    state.items[outfitId] = { status: "generating", lookId };
    await saveLooks(supabase, avatar.id, state);
    revalidatePath("/settings/avatar");
    return { state };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Look generation failed." };
  }
}

/** Poll all in-flight look generations; persist any progress. */
export async function refreshLooks(): Promise<ActionResult> {
  const { userId } = await requireUser();
  const { supabase, avatar, isTwin } = await activeTwin(userId);
  if (!avatar || !isTwin) return { error: "Digital twin required." };
  const state = parseLooks(avatar.looks);
  let dirty = false;

  for (const [outfitId, item] of Object.entries(state.items)) {
    if (item.status !== "generating" || !item.lookId) continue;
    const g = await getLookStatus(item.lookId);
    if (g.status === "ready" && g.imageUrl) {
      state.items[outfitId] = {
        status: "ready",
        lookId: item.lookId,
        imageUrl: g.imageUrl,
      };
      dirty = true;
    } else if (g.status === "failed") {
      state.items[outfitId] = {
        status: "failed",
        lookId: item.lookId,
        error: g.error,
      };
      dirty = true;
    }
  }

  if (dirty) {
    await saveLooks(supabase, avatar.id, state);
    revalidatePath("/settings/avatar");
  }
  return { state };
}

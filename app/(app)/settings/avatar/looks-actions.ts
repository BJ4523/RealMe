"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  trainPhotoModel,
  getPhotoModelStatus,
  generateLook,
  getLookGeneration,
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

/** One-time: start training the twin group's photo model (unlocks looks). */
export async function startModelTraining(): Promise<ActionResult> {
  const { userId } = await requireUser();
  const { supabase, avatar, isTwin } = await activeTwin(userId);
  if (!avatar || !isTwin || avatar.status !== "ready") {
    return { error: "A ready digital twin is required first." };
  }
  const state = parseLooks(avatar.looks);
  if (state.model === "ready" || state.model === "training") return { state };
  try {
    await trainPhotoModel(avatar.heygen_asset_id!);
    state.model = "training";
    await saveLooks(supabase, avatar.id, state);
    revalidatePath("/settings/avatar");
    return { state };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Training failed to start.";
    // Already trained → unblock immediately.
    if (/already.*train/i.test(msg)) {
      state.model = "ready";
      await saveLooks(supabase, avatar.id, state);
      return { state };
    }
    return { error: msg };
  }
}

/** Generate the canonical look image for one outfit (model must be ready). */
export async function startLookGeneration(
  outfitId: string,
): Promise<ActionResult> {
  const { userId } = await requireUser();
  const { supabase, avatar, isTwin } = await activeTwin(userId);
  if (!avatar || !isTwin) return { error: "Digital twin required." };
  const outfit = WARDROBES.find((w) => w.id === outfitId);
  if (!outfit) return { error: "Unknown outfit." };
  const state = parseLooks(avatar.looks);
  if (state.model !== "ready") {
    return { error: "Train the photo model first (one-time, a few minutes)." };
  }
  try {
    const { generationId } = await generateLook({
      groupId: avatar.heygen_asset_id!,
      prompt: `Standing in a bright, beautifully staged modern home interior, ${outfit.prompt}`,
    });
    state.items[outfitId] = { status: "generating", generationId };
    await saveLooks(supabase, avatar.id, state);
    revalidatePath("/settings/avatar");
    return { state };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Look generation failed." };
  }
}

/** Poll training + all in-flight look generations; persist any progress. */
export async function refreshLooks(): Promise<ActionResult> {
  const { userId } = await requireUser();
  const { supabase, avatar, isTwin } = await activeTwin(userId);
  if (!avatar || !isTwin) return { error: "Digital twin required." };
  const state = parseLooks(avatar.looks);
  let dirty = false;

  if (state.model === "training") {
    const s = await getPhotoModelStatus(avatar.heygen_asset_id!);
    if (s === "ready" || s === "failed") {
      state.model = s === "ready" ? "ready" : "failed";
      dirty = true;
    }
  }

  for (const [outfitId, item] of Object.entries(state.items)) {
    if (item.status !== "generating" || !item.generationId) continue;
    const g = await getLookGeneration(item.generationId);
    if (g.status === "ready" && g.lookId && g.imageUrl) {
      state.items[outfitId] = {
        status: "ready",
        lookId: g.lookId,
        imageUrl: g.imageUrl,
        generationId: item.generationId,
      };
      dirty = true;
    } else if (g.status === "failed") {
      state.items[outfitId] = {
        status: "failed",
        error: g.error,
        generationId: item.generationId,
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

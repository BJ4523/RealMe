"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createAvatarFromAsset, cloneVoiceFromAudio } from "@/lib/heygen/avatar";

export type AvatarState = { error?: string; ok?: boolean } | undefined;

/**
 * Upload the agent's photo/video to Storage, create a HeyGen Photo Avatar,
 * persist the avatar row as active, and mark onboarding complete.
 */
export async function createAvatar(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const { userId } = await requireUser();
  const file = formData.get("file");
  const audio = formData.get("audio");
  const name = (formData.get("name") as string) || "My avatar";

  if (!(file instanceof File) || file.size === 0) {
    return { error: "Choose a photo of yourself." };
  }
  if (file.size > 32 * 1024 * 1024) {
    return { error: "Photo must be under 32MB." };
  }
  const hasAudio = audio instanceof File && audio.size > 0;
  if (hasAudio && audio.size > 32 * 1024 * 1024) {
    return { error: "Voice clip must be under 32MB." };
  }

  const supabase = await createClient();
  const ext = file.name.split(".").pop() || "bin";
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error: uploadError } = await supabase.storage
    .from("avatar-sources")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) return { error: `Upload failed: ${uploadError.message}` };

  // Insert the avatar row in a processing state first.
  const { data: avatar, error: insertError } = await supabase
    .from("avatars")
    .insert({
      user_id: userId,
      name,
      source_path: path,
      status: "processing",
      is_active: false,
    })
    .select("id")
    .single();
  if (insertError || !avatar) {
    return { error: "Could not save your avatar. Try again." };
  }

  try {
    const bytes = await file.arrayBuffer();
    const result = await createAvatarFromAsset({
      bytes,
      contentType: file.type,
      name,
    });

    // Optional: clone the agent's voice from an uploaded audio clip so the
    // avatar narrates in their own voice. Falls back to a stock voice if absent.
    let voiceId: string | null = null;
    if (hasAudio) {
      voiceId = await cloneVoiceFromAudio({
        bytes: await audio.arrayBuffer(),
        contentType: audio.type,
        name: `${name} voice`,
      });
    }

    // Deactivate any previous active avatar, then activate this one.
    await supabase
      .from("avatars")
      .update({ is_active: false })
      .eq("user_id", userId);

    await supabase
      .from("avatars")
      .update({
        heygen_asset_id: result.assetId,
        heygen_avatar_id: result.avatarId,
        voice_id: voiceId,
        status: result.status,
        is_active: true,
      })
      .eq("id", avatar.id);

    await supabase
      .from("profiles")
      .update({ onboarding_completed: true, headshot_url: null })
      .eq("id", userId);
  } catch (e) {
    await supabase
      .from("avatars")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Avatar creation failed.",
      })
      .eq("id", avatar.id);
    return { error: "Avatar creation failed. Please try a different photo." };
  }

  revalidatePath("/", "layout");
  return { ok: true };
}

export async function setActiveAvatar(formData: FormData) {
  const { userId } = await requireUser();
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("avatars").update({ is_active: false }).eq("user_id", userId);
  await supabase.from("avatars").update({ is_active: true }).eq("id", id);
  revalidatePath("/settings/avatar");
}

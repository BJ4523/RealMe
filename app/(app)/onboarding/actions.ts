"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { createAvatarFromAsset, cloneVoiceFromAudio } from "@/lib/heygen/avatar";

export type AvatarState = { error?: string; ok?: boolean } | undefined;

/**
 * Turn a raw provider error into a user-facing message. HeyGen errors arrive as
 * `HeyGen <status> <url>: {"code":...,"message":"..."}` — surface that message
 * (e.g. "exceeded your limit of 3 photo avatars") instead of blaming the photo.
 */
function avatarErrorMessage(raw: string): string {
  const json = raw.match(/\{[\s\S]*\}/);
  if (json) {
    try {
      const parsed = JSON.parse(json[0]) as { message?: string };
      if (parsed.message) return `Avatar creation failed: ${parsed.message}`;
    } catch {
      // fall through to the generic message
    }
  }
  return "Avatar creation failed. Please try a different photo.";
}

/**
 * Create a HeyGen Photo Avatar from files the BROWSER already uploaded to
 * Storage, persist the avatar row as active, and mark onboarding complete.
 *
 * The photo/voice are uploaded client-side directly to Supabase Storage (the
 * `avatar-sources` bucket, owner-scoped by RLS) so they never pass through this
 * Server Action — avatars can be up to 32MB, far above the Next.js 1MB Server
 * Action body limit and Vercel's 4.5MB function-body cap. We receive only the
 * storage paths here, then download the bytes server-side to forward to HeyGen.
 */
export async function createAvatar(
  _prev: AvatarState,
  formData: FormData,
): Promise<AvatarState> {
  const { userId } = await requireUser();
  const photoPath = formData.get("photoPath");
  const photoContentType =
    (formData.get("photoContentType") as string) || "image/jpeg";
  const audioPath = formData.get("audioPath");
  const audioContentType =
    (formData.get("audioContentType") as string) || "audio/wav";
  const name = (formData.get("name") as string) || "My avatar";

  if (typeof photoPath !== "string" || photoPath.length === 0) {
    return { error: "Choose a photo of yourself." };
  }
  const hasAudio = typeof audioPath === "string" && audioPath.length > 0;

  // The client supplies the storage path, so confirm it lives inside the user's
  // own folder before trusting it (defense against a forged path).
  const prefix = `${userId}/`;
  if (!photoPath.startsWith(prefix) || (hasAudio && !audioPath.startsWith(prefix))) {
    return { error: "Upload path mismatch. Please retry." };
  }

  const supabase = await createClient();

  // Insert the avatar row in a processing state first.
  const { data: avatar, error: insertError } = await supabase
    .from("avatars")
    .insert({
      user_id: userId,
      name,
      source_path: photoPath,
      status: "processing",
      is_active: false,
    })
    .select("id")
    .single();
  if (insertError || !avatar) {
    return { error: "Could not save your avatar. Try again." };
  }

  try {
    const { data: photoBlob, error: photoErr } = await supabase.storage
      .from("avatar-sources")
      .download(photoPath);
    if (photoErr || !photoBlob) {
      throw new Error(photoErr?.message ?? "Could not read the uploaded photo.");
    }
    const result = await createAvatarFromAsset({
      bytes: await photoBlob.arrayBuffer(),
      contentType: photoContentType,
      name,
    });

    // Optional: clone the agent's voice from the uploaded audio clip so the
    // avatar narrates in their own voice. Falls back to a stock voice if absent.
    let voiceId: string | null = null;
    if (hasAudio) {
      const { data: audioBlob } = await supabase.storage
        .from("avatar-sources")
        .download(audioPath);
      if (audioBlob) {
        voiceId = await cloneVoiceFromAudio({
          bytes: await audioBlob.arrayBuffer(),
          contentType: audioContentType,
          name: `${name} voice`,
        });
      }
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
    const raw = e instanceof Error ? e.message : "Avatar creation failed.";
    await supabase
      .from("avatars")
      .update({ status: "failed", error: raw })
      .eq("id", avatar.id);
    return { error: avatarErrorMessage(raw) };
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

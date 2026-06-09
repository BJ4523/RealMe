"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import {
  createAvatarFromAsset,
  createDigitalTwin,
  cloneVoiceFromUrl,
  deleteHeygenAvatar,
  startTwinConsent,
} from "@/lib/heygen/avatar";

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
  const name = (formData.get("name") as string) || "My avatar";

  if (typeof photoPath !== "string" || photoPath.length === 0) {
    return { error: "Add a video of yourself." };
  }
  // A video creates a realistic Digital Twin (v3) whose voice is cloned from the
  // same clip; a photo (legacy fallback) creates a talking-photo avatar.
  const isVideo = photoContentType.startsWith("video/");

  // The client supplies the storage path, so confirm it lives inside the user's
  // own folder before trusting it (defense against a forged path).
  if (!photoPath.startsWith(`${userId}/`)) {
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
    // heygen_avatar_id = the id used to render (talking_photo id or twin look id);
    // heygen_asset_id = the talking_photo id (== avatar id) OR the twin group id.
    let heygenAvatarId: string;
    let heygenAssetId: string;
    let avatarStatus: "ready" | "processing" | "failed";
    let voiceId: string | null = null;

    if (isVideo) {
      // Digital Twin: HeyGen fetches the footage by URL, so hand it a temporary
      // signed URL to the private video in Storage (valid long enough to pull).
      const { data: signed, error: signErr } = await supabase.storage
        .from("avatar-sources")
        .createSignedUrl(photoPath, 3600);
      if (signErr || !signed?.signedUrl) {
        throw new Error(signErr?.message ?? "Could not prepare the video.");
      }
      const twin = await createDigitalTwin({ videoUrl: signed.signedUrl, name });
      heygenAvatarId = twin.lookId;
      heygenAssetId = twin.groupId;
      avatarStatus = twin.status;
      // Clone the agent's voice from the SAME video so the twin sounds like them
      // (no separate clip). Best-effort — falls back to a stock voice on failure.
      voiceId = await cloneVoiceFromUrl({ url: signed.signedUrl, name: `${name} voice` });
    } else {
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
      heygenAvatarId = result.avatarId;
      heygenAssetId = result.assetId;
      avatarStatus = result.status;
    }

    // Replace: remove the user's previous avatar(s) from HeyGen + Storage + DB
    // so this new one supersedes them and the (small, account-wide) HeyGen
    // photo-avatar quota doesn't fill with stale avatars. Best-effort cleanup;
    // failures here never fail the create.
    const { data: previous } = await supabase
      .from("avatars")
      .select("id, heygen_avatar_id, heygen_asset_id, source_path")
      .eq("user_id", userId)
      .neq("id", avatar.id);
    for (const prev of previous ?? []) {
      // Delete by the group id (heygen_asset_id) — that's what frees the quota
      // for both talking photos and twins.
      await deleteHeygenAvatar(prev.heygen_asset_id ?? prev.heygen_avatar_id);
      if (prev.source_path) {
        await supabase.storage.from("avatar-sources").remove([prev.source_path]);
      }
    }
    if (previous && previous.length > 0) {
      await supabase
        .from("avatars")
        .delete()
        .eq("user_id", userId)
        .neq("id", avatar.id);
    }

    await supabase
      .from("avatars")
      .update({
        heygen_asset_id: heygenAssetId,
        heygen_avatar_id: heygenAvatarId,
        voice_id: voiceId,
        status: avatarStatus,
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

/**
 * Begin HeyGen identity-consent for the user's active twin and return the
 * hosted recording URL (the client opens it in a new tab). Required before the
 * twin can be used in cinematic (Seedance) videos. Owner-scoped.
 */
export async function startAvatarConsent(): Promise<{
  url?: string;
  error?: string;
}> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: avatar } = await supabase
    .from("avatars")
    .select("heygen_asset_id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  if (!avatar?.heygen_asset_id) {
    return { error: "Create your avatar first, then verify it." };
  }
  try {
    const consent = await startTwinConsent(avatar.heygen_asset_id);
    if (!consent.url) {
      return { error: "Verification isn't available for this avatar yet." };
    }
    return { url: consent.url };
  } catch (e) {
    return {
      error: e instanceof Error ? e.message : "Could not start verification.",
    };
  }
}

export async function setActiveAvatar(formData: FormData) {
  const { userId } = await requireUser();
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("avatars").update({ is_active: false }).eq("user_id", userId);
  await supabase.from("avatars").update({ is_active: true }).eq("id", id);
  revalidatePath("/settings/avatar");
}

/**
 * Delete one of the user's own avatars: removes the HeyGen talking photo
 * (freeing a quota slot), the uploaded source in Storage, and the DB row.
 * Owner-scoped — a user can only delete their own avatars.
 */
export async function deleteAvatar(formData: FormData) {
  const { userId } = await requireUser();
  const id = formData.get("id") as string;
  if (!id) return;

  const supabase = await createClient();
  const { data: avatar } = await supabase
    .from("avatars")
    .select("id, heygen_avatar_id, heygen_asset_id, source_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();
  if (!avatar) return;

  await deleteHeygenAvatar(avatar.heygen_asset_id ?? avatar.heygen_avatar_id);
  if (avatar.source_path) {
    await supabase.storage.from("avatar-sources").remove([avatar.source_path]);
  }
  await supabase.from("avatars").delete().eq("id", id).eq("user_id", userId);
  revalidatePath("/settings/avatar");
}

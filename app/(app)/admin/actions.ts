"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteTalkingPhoto } from "@/lib/heygen/avatar";

/**
 * Admin-only: delete a HeyGen talking photo by id (cleans up orphaned custom
 * avatars that fill the account-wide photo-avatar quota).
 */
export async function deleteHeygenAvatar(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (id) await deleteTalkingPhoto(id);
  revalidatePath("/admin/avatars");
}

"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { deleteHeygenAvatar } from "@/lib/heygen/avatar";

/**
 * Admin-only: delete a HeyGen photo-avatar group by id (cleans up custom
 * avatars that fill the account-wide photo-avatar quota).
 */
export async function deleteAvatarGroupAction(formData: FormData) {
  await requireAdmin();
  const id = formData.get("id") as string;
  if (id) await deleteHeygenAvatar(id);
  revalidatePath("/admin/avatars");
}

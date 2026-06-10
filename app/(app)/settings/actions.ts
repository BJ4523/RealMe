"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";

export type SettingsState = { error?: string; ok?: boolean } | undefined;

export async function updateProfile(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: (formData.get("fullName") as string) || null,
      brokerage: (formData.get("brokerage") as string) || null,
      phone: (formData.get("phone") as string) || null,
    })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

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
      mls_agent_id: (formData.get("mlsAgentId") as string) || null,
    })
    .eq("id", userId);
  if (error) return { error: error.message };
  revalidatePath("/settings");
  return { ok: true };
}

/** Save the chosen MLS provider as a connection (manual/url need no creds). */
export async function saveMlsConnection(formData: FormData) {
  const { userId } = await requireUser();
  const provider = (formData.get("provider") as string) || "manual";
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("mls_connections")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  const connected = provider === "manual" || provider === "url_scrape";
  const payload = {
    user_id: userId,
    provider: provider as
      | "manual"
      | "url_scrape"
      | "simplyrets"
      | "reso"
      | "mlsgrid",
    status: (connected ? "connected" : "disconnected") as
      | "connected"
      | "disconnected"
      | "error",
  };

  if (existing) {
    await supabase.from("mls_connections").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("mls_connections").insert(payload);
  }
  revalidatePath("/settings/connections");
}

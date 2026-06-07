"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings";
import type { Json } from "@/lib/types/database";

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

/**
 * Save the chosen MLS provider as a connection. SimplyRETS also stores the
 * Basic-auth credentials and the agent id used to filter the agent's listings.
 */
export async function saveMlsConnection(formData: FormData) {
  const { userId } = await requireUser();
  const provider = (formData.get("provider") as string) || "manual";
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("mls_connections")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();

  let credentials: Record<string, string> = {};
  if (provider === "simplyrets") {
    credentials = {
      username: ((formData.get("username") as string) || "").trim(),
      password: ((formData.get("password") as string) || "").trim(),
    };
    const agentId = ((formData.get("agentMlsId") as string) || "").trim();
    await supabase
      .from("profiles")
      .update({ mls_agent_id: agentId || null })
      .eq("id", userId);
  }

  const connected =
    provider === "manual" ||
    provider === "url_scrape" ||
    provider === "simplyrets";

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
    credentials,
  };

  if (existing) {
    await supabase.from("mls_connections").update(payload).eq("id", existing.id);
  } else {
    await supabase.from("mls_connections").insert(payload);
  }
  revalidatePath("/settings/connections");
}

/**
 * Pull the agent's listings from the connected MLS provider and insert any new
 * ones into the listings table (deduped by external MLS id). Best-effort; safe
 * to run repeatedly.
 */
export async function syncListings(): Promise<void> {
  const { userId, profile } = await requireUser();
  const supabase = await createClient();

  const { data: conn } = await supabase
    .from("mls_connections")
    .select("provider, credentials")
    .eq("user_id", userId)
    .maybeSingle();
  if (!conn || conn.provider === "manual" || conn.provider === "url_scrape") {
    return;
  }

  let drafts;
  try {
    drafts = await getListingProvider(conn.provider).fetchListings({
      agentMlsId: profile?.mls_agent_id ?? undefined,
      credentials: (conn.credentials ?? {}) as Record<string, unknown>,
    });
  } catch (e) {
    await supabase
      .from("mls_connections")
      .update({ status: "error" })
      .eq("user_id", userId);
    console.error("MLS sync failed:", e);
    return;
  }

  const { data: existing } = await supabase
    .from("listings")
    .select("external_id")
    .eq("user_id", userId)
    .eq("source", conn.provider);
  const have = new Set((existing ?? []).map((r) => r.external_id));

  const rows = drafts
    .filter((d) => d.externalId && !have.has(d.externalId))
    .map((d) => ({
      user_id: userId,
      source: conn.provider as "simplyrets",
      external_id: d.externalId ?? null,
      source_url: d.sourceUrl ?? null,
      address: d.address,
      city: d.city ?? null,
      state: d.state ?? null,
      zip: d.zip ?? null,
      price: d.price ?? null,
      beds: d.beds ?? null,
      baths: d.baths ?? null,
      sqft: d.sqft ?? null,
      lot_size: d.lotSize ?? null,
      year_built: d.yearBuilt ?? null,
      property_type: d.propertyType ?? null,
      description: d.description ?? null,
      features: d.features,
      photos: d.photos as unknown as Json,
      status: "active" as const,
    }));

  if (rows.length > 0) {
    await supabase.from("listings").insert(rows);
  }
  await supabase
    .from("mls_connections")
    .update({ status: "connected", last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);
  revalidatePath("/listings");
  revalidatePath("/settings/connections");
}

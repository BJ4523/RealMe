"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import * as z from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { getListingProvider } from "@/lib/listings";
import { normalizeDraft, type ListingDraft } from "@/lib/listings/provider";
import type { Json } from "@/lib/types/database";

const listingInput = z.object({
  address: z.string().min(1, { error: "Address is required." }),
  city: z.string().optional(),
  state: z.string().optional(),
  zip: z.string().optional(),
  price: z.string().optional(),
  beds: z.string().optional(),
  baths: z.string().optional(),
  sqft: z.string().optional(),
  yearBuilt: z.string().optional(),
  propertyType: z.string().optional(),
  description: z.string().optional(),
  features: z.string().optional(),
  photos: z.string().optional(),
  sourceUrl: z.string().optional(),
  source: z.string().optional(),
});

export type ListingFormState = { error?: string } | undefined;

function draftFromForm(formData: FormData): ListingDraft {
  const raw = listingInput.parse(Object.fromEntries(formData));
  const features = (raw.features ?? "")
    .split(/[,\n]/)
    .map((f) => f.trim())
    .filter(Boolean);
  const photos = (raw.photos ?? "")
    .split(/[\n,]/)
    .map((u) => u.trim())
    .filter(Boolean)
    .map((url, order) => ({ url, order }));

  return normalizeDraft({
    address: raw.address,
    city: raw.city,
    state: raw.state,
    zip: raw.zip,
    price: raw.price ? Number(raw.price.replace(/[^0-9.]/g, "")) : undefined,
    beds: raw.beds ? Number(raw.beds) : undefined,
    baths: raw.baths ? Number(raw.baths) : undefined,
    sqft: raw.sqft ? Number(raw.sqft) : undefined,
    yearBuilt: raw.yearBuilt ? Number(raw.yearBuilt) : undefined,
    propertyType: raw.propertyType,
    description: raw.description,
    features,
    photos,
    sourceUrl: raw.sourceUrl,
  });
}

function draftToRow(draft: ListingDraft, userId: string, source: string) {
  return {
    user_id: userId,
    source: (source === "url" ? "url" : "manual") as "url" | "manual",
    source_url: draft.sourceUrl ?? null,
    address: draft.address,
    city: draft.city ?? null,
    state: draft.state ?? null,
    zip: draft.zip ?? null,
    price: draft.price ?? null,
    beds: draft.beds ?? null,
    baths: draft.baths ?? null,
    sqft: draft.sqft ?? null,
    lot_size: draft.lotSize ?? null,
    year_built: draft.yearBuilt ?? null,
    property_type: draft.propertyType ?? null,
    description: draft.description ?? null,
    features: draft.features,
    photos: draft.photos as unknown as Json,
    status: "active" as const,
  };
}

export async function createListing(
  _prev: ListingFormState,
  formData: FormData,
): Promise<ListingFormState> {
  const { userId } = await requireUser();
  let draft: ListingDraft;
  try {
    draft = draftFromForm(formData);
  } catch {
    return { error: "Please check the form fields." };
  }
  if (!draft.address) return { error: "Address is required." };

  const source = (formData.get("source") as string) || "manual";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("listings")
    .insert(draftToRow(draft, userId, source))
    .select("id")
    .single();

  if (error) return { error: error.message };

  revalidatePath("/listings");
  redirect(`/listings/${data.id}`);
}

export async function deleteListing(formData: FormData) {
  await requireUser();
  const id = formData.get("id") as string;
  const supabase = await createClient();
  await supabase.from("listings").delete().eq("id", id);
  revalidatePath("/listings");
  redirect("/listings");
}

/** Resolve a listing draft from a pasted URL (used by the import form). */
export async function importFromUrl(
  url: string,
): Promise<{ draft?: ListingDraft; error?: string }> {
  await requireUser();
  try {
    const provider = getListingProvider("url_scrape");
    const draft = await provider.fetchOne({ url });
    if (!draft) {
      return {
        error:
          "Couldn't read listing details from that URL. Try entering them manually.",
      };
    }
    return { draft };
  } catch {
    return { error: "Failed to fetch that URL." };
  }
}

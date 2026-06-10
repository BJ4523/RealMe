/**
 * Provider abstraction so the listing source (manual entry, URL scrape) is
 * swappable behind one interface. The UI and API routes depend only on this
 * interface — never on a concrete provider. MLS aggregators were removed; add
 * them back behind this same interface when re-enabled.
 */

export interface ListingPhoto {
  url: string;
  caption?: string;
  order: number;
}

export interface ListingDraft {
  address: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  lotSize?: string;
  yearBuilt?: number;
  propertyType?: string;
  description?: string;
  features: string[];
  photos: ListingPhoto[];
  externalId?: string;
  sourceUrl?: string;
}

export type ProviderId = "manual" | "url_scrape";

export interface FetchListingsOptions {
  credentials?: Record<string, unknown>;
}

export interface FetchOneRef {
  externalId?: string;
  url?: string;
  credentials?: Record<string, unknown>;
}

export interface ListingProvider {
  readonly id: ProviderId;
  /** Whether this provider needs saved credentials before it can sync. */
  readonly requiresConnection: boolean;
  /** Pull all listings this provider can resolve (manual/url return none). */
  fetchListings(opts: FetchListingsOptions): Promise<ListingDraft[]>;
  /** Resolve a single listing by external id (aggregators) or URL (scrape). */
  fetchOne(ref: FetchOneRef): Promise<ListingDraft | null>;
  /** Validate + normalize raw input (used by the manual provider). */
  normalize(input: Partial<ListingDraft>): ListingDraft;
}

/** Shared normalizer so every provider produces consistent drafts. */
export function normalizeDraft(input: Partial<ListingDraft>): ListingDraft {
  const photos = (input.photos ?? [])
    .filter((p) => p?.url)
    .map((p, i) => ({ url: p.url, caption: p.caption, order: p.order ?? i }));

  return {
    address: (input.address ?? "").trim(),
    city: input.city?.trim() || undefined,
    state: input.state?.trim() || undefined,
    zip: input.zip?.trim() || undefined,
    price: numberOrUndefined(input.price),
    beds: numberOrUndefined(input.beds),
    baths: numberOrUndefined(input.baths),
    sqft: numberOrUndefined(input.sqft),
    lotSize: input.lotSize?.trim() || undefined,
    yearBuilt: numberOrUndefined(input.yearBuilt),
    propertyType: input.propertyType?.trim() || undefined,
    description: input.description?.trim() || undefined,
    features: (input.features ?? []).map((f) => f.trim()).filter(Boolean),
    photos,
    externalId: input.externalId,
    sourceUrl: input.sourceUrl,
  };
}

function numberOrUndefined(v: unknown): number | undefined {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}

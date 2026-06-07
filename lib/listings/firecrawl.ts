import { env } from "@/lib/env";
import type { ListingDraft } from "./provider";

/**
 * Firecrawl-powered listing extraction. Firecrawl renders the page and gets
 * past the anti-bot walls that block a plain fetch on the big portals
 * (Zillow/Realtor/Redfin), then returns structured JSON per our schema.
 *
 * Returns null when no API key is configured or extraction yields nothing, so
 * the caller can fall back to the dependency-free scraper.
 */
const ENDPOINT = "https://api.firecrawl.dev/v2/scrape";

const LISTING_SCHEMA = {
  type: "object",
  properties: {
    address: { type: "string", description: "Street address only, no city/state" },
    city: { type: "string" },
    state: { type: "string" },
    zip: { type: "string" },
    price: { type: "number", description: "List price in dollars" },
    beds: { type: "number" },
    baths: { type: "number" },
    sqft: { type: "number", description: "Living area in square feet" },
    yearBuilt: { type: "number" },
    propertyType: { type: "string" },
    description: { type: "string", description: "Listing remarks/description" },
    features: { type: "array", items: { type: "string" } },
    photos: {
      type: "array",
      items: { type: "string" },
      description: "Full URLs of listing photos",
    },
  },
} as const;

interface FirecrawlListing {
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  beds?: number;
  baths?: number;
  sqft?: number;
  yearBuilt?: number;
  propertyType?: string;
  description?: string;
  features?: string[];
  photos?: string[];
}

export async function scrapeListingViaFirecrawl(
  url: string,
): Promise<Partial<ListingDraft> | null> {
  if (!env.firecrawlApiKey) return null;

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.firecrawlApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        url,
        onlyMainContent: true,
        formats: [
          {
            type: "json",
            schema: LISTING_SCHEMA,
            prompt:
              "Extract the real estate listing details from this property page.",
          },
        ],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;

  const body = (await res.json().catch(() => null)) as {
    data?: { json?: FirecrawlListing; extract?: FirecrawlListing };
  } | null;
  const data = body?.data?.json ?? body?.data?.extract;
  if (!data || typeof data !== "object") return null;

  const photos = Array.isArray(data.photos)
    ? data.photos
        .filter((u): u is string => typeof u === "string" && u.length > 0)
        .map((u, order) => ({ url: u, order }))
    : [];

  const draft: Partial<ListingDraft> = {
    address: data.address,
    city: data.city,
    state: data.state,
    zip: data.zip,
    price: data.price,
    beds: data.beds,
    baths: data.baths,
    sqft: data.sqft,
    yearBuilt: data.yearBuilt,
    propertyType: data.propertyType,
    description: data.description,
    features: Array.isArray(data.features) ? data.features : [],
    photos,
    sourceUrl: url,
  };
  return draft;
}

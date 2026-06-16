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

// Below this much page text, the site served a bot-block/consent stub (a real
// listing page is thousands of chars). We distrust extraction from such pages —
// the LLM hallucinates placeholder data when there's nothing real to read.
const MIN_PAGE_CHARS = 600;

/** Obvious LLM-placeholder addresses to reject even if a page sneaks through. */
const PLACEHOLDER_ADDRESS = /\b123\s+main\s+st/i;

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
      description:
        "EVERY full-resolution photo URL from the listing's ENTIRE photo gallery — " +
        "all of them, in order, not just the hero/main image. Include every interior " +
        "and exterior shot you can find on the page (typically 15-50+ images).",
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

/**
 * Pull the FULL photo gallery from the page's raw HTML. The portals lazy-load
 * most gallery images via JS (so a rendered scrape sees only ~5), but they also
 * embed every full-resolution URL in the server HTML — we just have to pick the
 * gallery size and skip the "similar homes" thumbnails (other sizes). Order of
 * first appearance = gallery order; dedup by photo id. Empty for unknown hosts
 * (caller falls back to the LLM-extracted photos).
 */
function extractGalleryFromHtml(html: string): string[] {
  const collect = (re: RegExp): string[] => {
    const seen = new Set<string>();
    const out: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = re.exec(html))) {
      const key = m[1] ?? m[0];
      if (!seen.has(key)) {
        seen.add(key);
        out.push(m[0]);
      }
    }
    return out;
  };
  // Zillow — full-res gallery size (cc_ft_1536); dedup by photo id.
  const zillow = collect(
    /https:\/\/photos\.zillowstatic\.com\/fp\/([a-f0-9]+)-cc_ft_1536\.jpg/g,
  );
  if (zillow.length) return zillow;
  // Redfin — listing photo CDN.
  const redfin = collect(/https:\/\/ssl\.cdn-redfin\.com\/photo\/[^\s"'<>\\]+?\.jpg/g);
  if (redfin.length) return redfin;
  return [];
}

/** One Firecrawl scrape: raw HTML (for the full gallery) + markdown + LLM JSON. */
async function fetchScrape(
  url: string,
): Promise<{ json: FirecrawlListing | null; html: string; mdLen: number } | null> {
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
        onlyMainContent: false,
        waitFor: 6000,
        formats: [
          "rawHtml",
          "markdown",
          {
            type: "json",
            schema: LISTING_SCHEMA,
            prompt:
              "Extract the real estate listing details (address, price, beds, baths, " +
              "sqft, description, features). Photos optional.",
          },
        ],
      }),
    });
  } catch {
    return null;
  }
  if (!res.ok) return null;
  const body = (await res.json().catch(() => null)) as {
    success?: boolean;
    data?: {
      rawHtml?: string;
      markdown?: string;
      json?: FirecrawlListing;
      extract?: FirecrawlListing;
    };
  } | null;
  if (!body?.success) return null;
  return {
    json: body.data?.json ?? body.data?.extract ?? null,
    html: body.data?.rawHtml ?? "",
    mdLen: (body.data?.markdown ?? "").length,
  };
}

export async function scrapeListingViaFirecrawl(
  url: string,
): Promise<Partial<ListingDraft> | null> {
  if (!env.firecrawlApiKey) return null;

  // One reliable request (no flaky scroll-actions): the raw HTML carries the WHOLE
  // gallery, the LLM JSON carries the metadata. Retry once on Firecrawl hiccups.
  const r = (await fetchScrape(url)) ?? (await fetchScrape(url));
  if (!r) return null;
  // A blocked/bot-walled page (e.g. Realtor.com) returns a tiny stub, and the LLM
  // then HALLUCINATES placeholders ("123 Main St"). Reject thin pages outright.
  if (r.mdLen < MIN_PAGE_CHARS) return null;
  const data = r.json ?? {};
  if (data.address && PLACEHOLDER_ADDRESS.test(data.address)) return null;

  // Full gallery from the HTML; fall back to the LLM photos for unknown hosts.
  const gallery = extractGalleryFromHtml(r.html);
  const llmPhotos = Array.isArray(data.photos)
    ? data.photos.filter((u): u is string => typeof u === "string" && /^https?:\/\//.test(u))
    : [];
  const urls = gallery.length >= llmPhotos.length ? gallery : llmPhotos;
  if (urls.length === 0 && !data.address) return null;

  const photos = urls.map((u, order) => ({ url: u, order }));

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

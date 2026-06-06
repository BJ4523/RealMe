import {
  normalizeDraft,
  type FetchOneRef,
  type ListingDraft,
  type ListingPhoto,
  type ListingProvider,
} from "./provider";

/**
 * Best-effort listing import from a public URL. Extraction order:
 *   1. schema.org JSON-LD (RealEstateListing / Product / Residence)
 *   2. OpenGraph / Twitter meta tags
 * A Claude-based fallback on the raw HTML can be layered in later behind the
 * same interface (see lib/ai). Dependency-free so it runs on any runtime.
 */
export const urlScrapeProvider: ListingProvider = {
  id: "url_scrape",
  requiresConnection: false,

  async fetchListings() {
    return [];
  },

  async fetchOne(ref: FetchOneRef): Promise<ListingDraft | null> {
    if (!ref.url) return null;
    let url: URL;
    try {
      url = new URL(ref.url);
    } catch {
      return null;
    }

    const res = await fetch(url, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (compatible; RealMeBot/1.0; +https://realme.app)",
        Accept: "text/html",
      },
    });
    if (!res.ok) return null;
    const html = await res.text();

    const fromJsonLd = extractJsonLd(html);
    const fromMeta = extractMeta(html);

    const merged: Partial<ListingDraft> = {
      ...fromMeta,
      ...stripUndefined(fromJsonLd),
      sourceUrl: url.toString(),
      photos: dedupePhotos([
        ...(fromJsonLd.photos ?? []),
        ...(fromMeta.photos ?? []),
      ]),
    };

    if (!merged.address && !merged.description) return null;
    return normalizeDraft(merged);
  },

  normalize(input: Partial<ListingDraft>) {
    return normalizeDraft(input);
  },
};

function extractJsonLd(html: string): Partial<ListingDraft> {
  const out: Partial<ListingDraft> = {};
  const photos: ListingPhoto[] = [];
  const blocks = [
    ...html.matchAll(
      /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
    ),
  ];

  for (const m of blocks) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim());
    } catch {
      continue;
    }
    const nodes = Array.isArray(data) ? data : [data];
    for (const node of nodes) {
      if (!node || typeof node !== "object") continue;
      const n = node as Record<string, unknown>;
      const graph = Array.isArray(n["@graph"]) ? n["@graph"] : [n];
      for (const g of graph as Record<string, unknown>[]) {
        const addr = g.address as Record<string, unknown> | string | undefined;
        if (typeof addr === "object" && addr) {
          out.address ??= asString(addr.streetAddress);
          out.city ??= asString(addr.addressLocality);
          out.state ??= asString(addr.addressRegion);
          out.zip ??= asString(addr.postalCode);
        }
        out.description ??= asString(g.description);
        out.propertyType ??= asString(g["@type"]);
        const offers = g.offers as Record<string, unknown> | undefined;
        out.price ??= asNumber(offers?.price ?? g.price);
        out.beds ??= asNumber(g.numberOfRooms ?? g.numberOfBedrooms);
        out.sqft ??= asNumber(
          (g.floorSize as Record<string, unknown>)?.value ?? g.floorSize,
        );
        collectImages(g.image, photos);
      }
    }
  }
  if (photos.length) out.photos = photos;
  return out;
}

function extractMeta(html: string): Partial<ListingDraft> {
  const og = (prop: string) =>
    matchAttr(
      html,
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`,
        "i",
      ),
    );
  const title = og("og:title") ?? matchAttr(html, /<title>([^<]+)<\/title>/i);
  const description = og("og:description") ?? og("description");
  const image = og("og:image");

  const photos: ListingPhoto[] = [];
  if (image) photos.push({ url: image, order: 0 });

  return {
    address: title,
    description,
    photos,
  };
}

function collectImages(image: unknown, into: ListingPhoto[]) {
  const push = (u: unknown) => {
    const url = asString(u) ?? asString((u as Record<string, unknown>)?.url);
    if (url) into.push({ url, order: into.length });
  };
  if (Array.isArray(image)) image.forEach(push);
  else if (image) push(image);
}

function dedupePhotos(photos: ListingPhoto[]): ListingPhoto[] {
  const seen = new Set<string>();
  const out: ListingPhoto[] = [];
  for (const p of photos) {
    if (!p.url || seen.has(p.url)) continue;
    seen.add(p.url);
    out.push({ ...p, order: out.length });
  }
  return out;
}

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function asNumber(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(String(v).replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? n : undefined;
}
function matchAttr(html: string, re: RegExp): string | undefined {
  const m = html.match(re);
  return m ? m[1].trim() : undefined;
}
function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(o).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

export function formatPrice(price: number | null | undefined): string {
  if (price == null) return "Price on request";
  return `$${Math.round(Number(price)).toLocaleString("en-US")}`;
}

export function formatSpecs(listing: {
  beds?: number | null;
  baths?: number | null;
  sqft?: number | null;
}): string {
  return [
    listing.beds != null ? `${listing.beds} bd` : null,
    listing.baths != null ? `${listing.baths} ba` : null,
    listing.sqft != null ? `${listing.sqft.toLocaleString("en-US")} sqft` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function formatAddress(listing: {
  address: string;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
}): string {
  const tail = [listing.city, listing.state].filter(Boolean).join(", ");
  return [listing.address, tail, listing.zip].filter(Boolean).join(" · ");
}

export interface PhotoJson {
  url: string;
  caption?: string;
  order?: number;
}

export function listingPhotos(photos: unknown): PhotoJson[] {
  if (!Array.isArray(photos)) return [];
  return (photos as PhotoJson[])
    .filter((p) => p && typeof p.url === "string")
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

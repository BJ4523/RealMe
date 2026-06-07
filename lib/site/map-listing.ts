import type { Tables } from "@/lib/types/database";
import { listingPhotos } from "@/lib/format";

const HERO_PALETTE = [
  "#7AA8B5",
  "#C9B689",
  "#B98E73",
  "#8B9DA5",
  "#3F4A55",
  "#6E7A55",
];

/** Shape the dashboard design components expect for a listing. */
export interface DesignListing {
  id: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  sqft: number;
  status: "new" | "active" | "pending";
  daysListed: number;
  style: string;
  hero: string;
  img: string;
  views: number;
  photos: number;
  autoImported: boolean;
}

/** Map a real Supabase listing row into the design's listing shape. */
export function mapDbListingToDesign(
  row: Tables<"listings">,
  index = 0,
): DesignListing {
  const photos = listingPhotos(row.photos);
  const created = new Date(row.created_at).getTime();
  const days = Math.max(0, Math.floor((Date.now() - created) / 86_400_000));
  const status: DesignListing["status"] =
    row.status === "active" ? (days <= 2 ? "new" : "active") : "new";

  return {
    id: row.id,
    address: row.address,
    city: [row.city, row.state].filter(Boolean).join(", ") || "—",
    price: Number(row.price ?? 0),
    beds: Number(row.beds ?? 0),
    baths: Number(row.baths ?? 0),
    sqft: Number(row.sqft ?? 0),
    status,
    daysListed: days,
    style: row.property_type || "Listing",
    hero: HERO_PALETTE[index % HERO_PALETTE.length],
    img: photos[0]?.url ?? "",
    views: 0,
    photos: photos.length,
    autoImported: row.source !== "manual",
  };
}

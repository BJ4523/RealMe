import Link from "next/link";
import { ImageOff } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import { formatPrice, formatSpecs, listingPhotos } from "@/lib/format";

export function ListingCard({ listing }: { listing: Tables<"listings"> }) {
  const photos = listingPhotos(listing.photos);
  const cover = photos[0]?.url;

  return (
    <Link
      href={`/listings/${listing.id}`}
      className="group flex flex-col overflow-hidden rounded-3xl border border-border bg-card transition-shadow hover:shadow-lg"
    >
      <div className="aspect-video overflow-hidden bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={cover}
            alt={listing.address}
            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
          />
        ) : (
          <div className="flex size-full items-center justify-center text-muted-foreground">
            <ImageOff className="size-8" />
          </div>
        )}
      </div>
      <div className="flex flex-col gap-1 p-5">
        <p className="font-heading text-xl font-bold">
          {formatPrice(listing.price)}
        </p>
        <p className="text-sm font-medium">{listing.address}</p>
        <p className="text-sm text-muted-foreground">
          {[listing.city, listing.state].filter(Boolean).join(", ")}
        </p>
        {formatSpecs(listing) ? (
          <p className="mt-2 font-mono text-xs text-muted-foreground">
            {formatSpecs(listing)}
          </p>
        ) : null}
      </div>
    </Link>
  );
}

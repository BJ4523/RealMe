"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import type { Tables } from "@/lib/types/database";
import { ListingCard } from "./listing-card";

type Listing = Tables<"listings">;

/** Client search over the server-fetched listings: address/city search + grid. */
export function ListingsFilter({ listings }: { listings: Listing[] }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const shown = query
    ? listings.filter((l) =>
        [l.address, l.city, l.state]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query),
      )
    : listings;

  return (
    <div className="flex flex-col gap-5">
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by address or city…"
          aria-label="Search listings"
          className="w-full rounded-full border border-border bg-background py-2 pl-9 pr-4 text-sm text-foreground"
        />
      </div>

      {shown.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <p className="py-12 text-center text-sm text-muted-foreground">
          No listings match “{q}”.
        </p>
      )}
    </div>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { Clapperboard, Trash2, ArrowLeft } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { formatPrice, formatSpecs, listingPhotos } from "@/lib/format";
import { generateForListing } from "@/app/(app)/videos/actions";
import { deleteListing } from "@/app/(app)/listings/actions";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default async function ListingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireOnboarded();
  const { id } = await params;
  const supabase = await createClient();

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (!listing) notFound();

  const { data: videos } = await supabase
    .from("videos")
    .select("id, status, created_at")
    .eq("listing_id", id)
    .order("created_at", { ascending: false });

  const photos = listingPhotos(listing.photos);

  return (
    <>
      <Link
        href="/listings"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All listings
      </Link>

      {photos.length > 0 ? (
        <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {photos.slice(0, 8).map((p, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={p.url}
              alt={p.caption ?? listing.address}
              className="aspect-square w-full rounded-2xl object-cover"
            />
          ))}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="font-heading text-4xl font-extrabold">
            {formatPrice(listing.price)}
          </p>
          <p className="mt-1 text-lg font-medium">{listing.address}</p>
          <p className="text-muted-foreground">
            {[listing.city, listing.state, listing.zip]
              .filter(Boolean)
              .join(", ")}
          </p>
          {formatSpecs(listing) ? (
            <p className="mt-3 font-mono text-sm text-muted-foreground">
              {formatSpecs(listing)}
            </p>
          ) : null}
        </div>
        <form action={generateForListing}>
          <input type="hidden" name="listingId" value={listing.id} />
          <Button
            type="submit"
            size="lg"
            className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
          >
            <Clapperboard className="size-5" /> Generate video
          </Button>
        </form>
      </div>

      {listing.features && listing.features.length > 0 ? (
        <div className="mt-6 flex flex-wrap gap-2">
          {listing.features.map((f) => (
            <Badge key={f} variant="secondary" className="rounded-full">
              {f}
            </Badge>
          ))}
        </div>
      ) : null}

      {listing.description ? (
        <p className="mt-6 max-w-2xl leading-relaxed text-foreground/90">
          {listing.description}
        </p>
      ) : null}

      {videos && videos.length > 0 ? (
        <div className="mt-10">
          <h2 className="font-heading text-xl font-bold">Videos</h2>
          <div className="mt-3 flex flex-col gap-2">
            {videos.map((v) => (
              <Link
                key={v.id}
                href={`/videos/${v.id}`}
                className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 text-sm hover:shadow"
              >
                <span className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                  {v.status.replace(/_/g, " ")}
                </span>
                <span className="text-muted-foreground">
                  {new Date(v.created_at).toLocaleDateString()}
                </span>
              </Link>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-12 border-t border-border/60 pt-6">
        <form action={deleteListing}>
          <input type="hidden" name="id" value={listing.id} />
          <Button
            type="submit"
            variant="ghost"
            className="rounded-full text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" /> Delete listing
          </Button>
        </form>
      </div>
    </>
  );
}

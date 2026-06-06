import Link from "next/link";
import { Home, Plus, Link2 } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListingCard } from "@/components/listings/listing-card";
import { Button } from "@/components/ui/button";

export default async function ListingsPage() {
  await requireOnboarded();
  const supabase = await createClient();
  const { data: listings } = await supabase
    .from("listings")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Listings"
        description="Add a property, then generate a walkthrough video for it."
        action={
          <div className="flex gap-2">
            <Button asChild variant="outline" className="rounded-full">
              <Link href="/settings/connections">
                <Link2 className="size-4" /> Connect MLS
              </Link>
            </Button>
            <Button
              asChild
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/listings/new">
                <Plus className="size-4" /> Add listing
              </Link>
            </Button>
          </div>
        }
      />

      {listings && listings.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {listings.map((listing) => (
            <ListingCard key={listing.id} listing={listing} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Home className="size-6" />}
          title="No listings yet"
          description="Add your first property manually or import it from a listing URL."
          action={
            <Button
              asChild
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
            >
              <Link href="/listings/new">
                <Plus className="size-4" /> Add listing
              </Link>
            </Button>
          }
        />
      )}
    </>
  );
}

import Link from "next/link";
import { Home, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { ListingsFilter } from "@/components/listings/listings-filter";
import { Button } from "@/components/ui/button";

export default async function ListingsPage() {
  await requireUser();
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
          <Button
            asChild
            className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
          >
            <Link href="/listings/new">
              <Plus className="size-4" /> Add listing
            </Link>
          </Button>
        }
      />

      {listings && listings.length > 0 ? (
        <ListingsFilter listings={listings} />
      ) : (
        <EmptyState
          icon={<Home className="size-6" />}
          title="No listings yet"
          description="Add your first property manually or import it from a listing URL."
          action={
            <Button
              asChild
              className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
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

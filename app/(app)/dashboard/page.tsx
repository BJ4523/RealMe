import Link from "next/link";
import { Home, Clapperboard, Plus, ArrowRight } from "lucide-react";
import { requireOnboarded } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { VideoCard } from "@/components/videos/video-card";
import { Button } from "@/components/ui/button";

export default async function DashboardPage() {
  const { profile } = await requireOnboarded();
  const supabase = await createClient();

  const [{ count: listingCount }, { count: videoCount }, { data: recent }] =
    await Promise.all([
      supabase.from("listings").select("*", { count: "exact", head: true }),
      supabase.from("videos").select("*", { count: "exact", head: true }),
      supabase
        .from("videos")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(3),
    ]);

  const firstName = profile?.full_name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Welcome back, ${firstName}` : "Dashboard"}
        description="Make a new walkthrough or pick up where you left off."
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

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/listings"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
        >
          <div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/30">
              <Home className="size-5" />
            </div>
            <p className="mt-4 font-heading text-3xl font-extrabold">
              {listingCount ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">Listings</p>
          </div>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Link>
        <Link
          href="/videos"
          className="flex items-center justify-between rounded-3xl border border-border bg-card p-6 transition-shadow hover:shadow-lg"
        >
          <div>
            <div className="flex size-11 items-center justify-center rounded-2xl bg-accent/30">
              <Clapperboard className="size-5" />
            </div>
            <p className="mt-4 font-heading text-3xl font-extrabold">
              {videoCount ?? 0}
            </p>
            <p className="text-sm text-muted-foreground">Videos</p>
          </div>
          <ArrowRight className="size-5 text-muted-foreground" />
        </Link>
      </div>

      {recent && recent.length > 0 ? (
        <div className="mt-10">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-heading text-xl font-bold">Recent videos</h2>
            <Link
              href="/videos"
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              View all
            </Link>
          </div>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recent.map((video) => (
              <VideoCard key={video.id} video={video} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

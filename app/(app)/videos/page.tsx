import Link from "next/link";
import { Clapperboard, Home } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { VideosFilter } from "@/components/videos/videos-filter";
import { Button } from "@/components/ui/button";

export default async function VideosPage() {
  await requireUser();
  const supabase = await createClient();
  const { data: videos } = await supabase
    .from("videos")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        title="Videos"
        description="Every walkthrough you've generated."
      />

      {videos && videos.length > 0 ? (
        <VideosFilter videos={videos} />
      ) : (
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="No videos yet"
          description="Open a listing and hit Generate video to make your first walkthrough."
          action={
            <Button
              asChild
              className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
            >
              <Link href="/listings">
                <Home className="size-4" /> Go to listings
              </Link>
            </Button>
          }
        />
      )}
    </>
  );
}

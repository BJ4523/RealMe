import Link from "next/link";
import { Clapperboard, Home } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { EmptyState } from "@/components/shared/empty-state";
import { VideoCard } from "@/components/videos/video-card";
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
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video) => (
            <VideoCard key={video.id} video={video} />
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Clapperboard className="size-6" />}
          title="No videos yet"
          description="Open a listing and hit Generate video to make your first walkthrough."
          action={
            <Button
              asChild
              className="rounded-full bg-accent text-accent-foreground hover:bg-accent/90"
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

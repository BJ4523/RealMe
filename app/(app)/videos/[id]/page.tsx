import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/shared/page-header";
import { VideoDetail } from "@/components/videos/video-detail";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const supabase = await createClient();

  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(address)")
    .eq("id", id)
    .maybeSingle();
  if (!video) notFound();

  const { listings, ...videoRow } = video;
  const listing = listings as { address: string } | null;

  return (
    <>
      <Link
        href="/videos"
        className="mb-6 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" /> All videos
      </Link>
      <PageHeader
        title={video.title ?? "Walkthrough video"}
        description={listing?.address}
      />
      <VideoDetail initialVideo={videoRow} />
    </>
  );
}

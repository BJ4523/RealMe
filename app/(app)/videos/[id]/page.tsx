import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTwinConsentStatus, isConsentVerified } from "@/lib/heygen/avatar";
import { PageHeader } from "@/components/shared/page-header";
import { VideoDetail } from "@/components/videos/video-detail";

export default async function VideoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { userId } = await requireUser();
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

  // Cinematic mode needs a consent-verified digital twin — check the active one.
  const { data: avatar } = await supabase
    .from("avatars")
    .select("heygen_avatar_id, heygen_asset_id, status")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  const isTwin = !!(
    avatar?.status === "ready" &&
    avatar.heygen_asset_id &&
    avatar.heygen_asset_id !== avatar.heygen_avatar_id
  );
  let cinematicReady = false;
  if (isTwin && avatar?.heygen_asset_id) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id);
    cinematicReady = isConsentVerified(consent);
  }

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
      <VideoDetail
        initialVideo={videoRow}
        cinematicReady={cinematicReady}
        hasTwin={isTwin}
      />
    </>
  );
}

import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getTwinConsentStatus, isConsentVerified } from "@/lib/heygen/avatar";
import { DeleteVideoButton } from "@/components/videos/delete-video-button";
import { PageHeader } from "@/components/shared/page-header";
import { VideoDetail } from "@/components/videos/video-detail";
import { TRACKS } from "@/lib/video/music/tracks";
import { listingPhotos, tourPhotosFor } from "@/lib/format";

// The page-poll server action (pollVideoStatus) runs the heavy ffmpeg stitch +
// lipsync inline. Give it the full window so Stage B finishes in one invocation
// instead of hitting the default timeout (504) and looping. Pro honors 300s;
// Hobby caps lower, which is why unattended completion really needs the cron.
export const maxDuration = 300;

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
    .select("*, listings(address, photos)")
    .eq("id", id)
    .maybeSingle();
  if (!video) notFound();

  const { listings, ...videoRow } = video;
  const listing = listings as { address: string; photos: unknown } | null;
  // The listing's photos are the pool; THIS video's tour is a saved ordered subset
  // (script_segments.tourPhotos), defaulting to all photos. "Add" draws from the rest.
  const pool = listingPhotos(listing?.photos);
  const byUrl = new Map(pool.map((p) => [p.url, p]));
  const tourUrls = tourPhotosFor(videoRow.script_segments, listing?.photos);
  const photos = tourUrls.map((u) => byUrl.get(u) ?? { url: u });
  const availablePhotos = pool.filter((p) => !tourUrls.includes(p.url));

  // Cinematic mode needs a consent-verified digital twin — check the active one.
  const { data: avatar } = await supabase
    .from("avatars")
    .select("*")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();
  // AI mode needs a photo (Runway likeness); voice is optional (silent test reel).
  const aiAv = avatar as { el_voice_id?: string | null; agent_image_url?: string | null } | null;
  const aiReady = !!aiAv?.agent_image_url;
  const isTwin = !!(
    avatar?.status === "ready" &&
    avatar.heygen_asset_id &&
    avatar.heygen_asset_id !== avatar.heygen_avatar_id
  );
  // Only consult HeyGen when the page actually shows generation buttons —
  // processing/completed videos don't, so they render without the round-trip
  // (this external call was the main TTFB cost of the page; also cached).
  const needsGenerateButtons = ["pending_script", "script_ready", "failed"].includes(
    videoRow.status,
  );
  let cinematicReady = false;
  if (needsGenerateButtons && isTwin && avatar?.heygen_asset_id) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id);
    cinematicReady = isConsentVerified(consent);
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <Link
          href="/videos"
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> All videos
        </Link>
        <DeleteVideoButton videoId={videoRow.id} variant="full" redirectTo="/videos" />
      </div>
      <PageHeader
        title={video.title ?? "Walkthrough video"}
        description={listing?.address}
      />
      <VideoDetail
        initialVideo={videoRow}
        cinematicReady={cinematicReady}
        hasTwin={isTwin}
        aiReady={aiReady}
        photos={photos}
        availablePhotos={availablePhotos}
        tracks={TRACKS.map((t) => ({
          id: t.id,
          title: t.title,
          previewUrl: t.previewUrl,
        }))}
      />
    </>
  );
}

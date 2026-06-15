import { LivePageClient } from "@/components/site/live/live-page";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";

export const metadata = {
  title: "RealMe LIVE — every listing, with the agent on camera",
};

// Public page — fetch the latest finished reel (service-role) and re-sign fresh
// URLs each load so the hero player never shows an expired link.
export default async function LivePage() {
  let heroReelUrl: string | null = null;
  let heroPoster: string | null = null;

  if (adminConfigured) {
    try {
      const sb = createAdminClient();
      const { data } = await sb
        .from("videos")
        .select("id, user_id, thumbnail_url")
        .eq("status", "completed")
        .not("video_url", "is", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        const { data: v } = await sb.storage
          .from("video-cache")
          .createSignedUrl(`${data.user_id}/${data.id}.mp4`, 60 * 60);
        heroReelUrl = v?.signedUrl ?? null;
        const { data: t } = await sb.storage
          .from("video-cache")
          .createSignedUrl(`${data.user_id}/${data.id}-thumb.jpg`, 60 * 60);
        heroPoster = t?.signedUrl ?? data.thumbnail_url ?? null;
      }
    } catch {
      /* no hero reel — fall back to the demo UI */
    }
  }

  return <LivePageClient heroReelUrl={heroReelUrl} heroPoster={heroPoster} />;
}

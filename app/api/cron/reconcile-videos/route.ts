import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getVideoStatus } from "@/lib/heygen/video";
import { reconcileAvatar } from "@/lib/avatars/reconcile";
import { assembleCinematicVideo, isCinematic } from "@/lib/video/cinematic";
import { assembleHypeReel, isHypeReel } from "@/lib/video/hypereel";
import { listingPhotos } from "@/lib/format";
import { env } from "@/lib/env";

/**
 * Self-heals videos AND avatars stuck in `processing` (e.g. a missed webhook, or
 * digital-twin training that finished/failed with no callback). Protected by
 * CRON_SECRET. Runs on a schedule via vercel.json. Uses the service-role client.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const headerOk = auth === `Bearer ${env.cronSecret}`;
  const queryOk =
    request.nextUrl.searchParams.get("secret") === env.cronSecret;
  if (env.cronSecret && !headerOk && !queryOk) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!adminConfigured) {
    return NextResponse.json({ error: "not configured" }, { status: 503 });
  }

  const supabase = createAdminClient();
  const { data: stuck } = await supabase
    .from("videos")
    .select("id, heygen_video_id, thumbnail_url")
    .eq("status", "processing")
    .not("heygen_video_id", "is", null)
    .limit(50);

  let reconciled = 0;
  for (const v of stuck ?? []) {
    if (!v.heygen_video_id) continue;
    if (isCinematic(v.heygen_video_id)) continue; // handled in the cinematic pass
    if (isHypeReel(v.heygen_video_id)) continue; // handled in the hype-reel pass
    const status = await getVideoStatus(v.heygen_video_id, {
      thumbnailUrl: v.thumbnail_url ?? undefined,
    });
    if (status.status === "completed") {
      await supabase
        .from("videos")
        .update({
          status: "completed",
          video_url: status.videoUrl ?? null,
          duration: status.duration ?? null,
        })
        .eq("id", v.id);
      reconciled++;
    } else if (status.status === "failed") {
      await supabase
        .from("videos")
        .update({ status: "failed", error: status.error ?? "Failed" })
        .eq("id", v.id);
      reconciled++;
    }
  }

  // Digital twins never webhook on training, so reconcile any that are stuck on
  // `processing` (marks them ready/failed with the HeyGen failure reason).
  const { data: stuckAvatars } = await supabase
    .from("avatars")
    .select("id, status, heygen_avatar_id, error, voice_id")
    .eq("status", "processing")
    .not("heygen_avatar_id", "is", null)
    .limit(50);

  let avatarsReconciled = 0;
  for (const a of stuckAvatars ?? []) {
    const updated = await reconcileAvatar(supabase, a);
    if (updated.status !== "processing") avatarsReconciled++;
  }

  // Cinematic walkthroughs (clips → stitch → narrate). Backstop for the inline
  // poll-driven assembly. Reset a stale `submitting` lock (a crashed assembly)
  // back to `processing` so it can be re-claimed and completed here.
  const { data: cineVideos } = await supabase
    .from("videos")
    .select("id, user_id, script, script_segments, heygen_video_id, status, avatar_id, listing_id")
    .in("status", ["processing", "submitting"])
    .like("heygen_video_id", "cine:%")
    .limit(20);

  let cinematicAssembled = 0;
  for (const v of cineVideos ?? []) {
    if (!isCinematic(v.heygen_video_id)) continue;
    if (v.status === "submitting") {
      await supabase
        .from("videos")
        .update({ status: "processing" })
        .eq("id", v.id)
        .eq("status", "submitting");
    }
    const { data: av } = await supabase
      .from("avatars")
      .select("voice_id")
      .eq("id", v.avatar_id ?? "")
      .maybeSingle();
    const { data: lst } = await supabase.from("listings").select("photos").eq("id", v.listing_id ?? "").maybeSingle();
    const photos = lst ? listingPhotos(lst.photos).map((p) => p.url) : [];
    const result = await assembleCinematicVideo(
      supabase,
      {
        id: v.id,
        user_id: v.user_id,
        script: v.script,
        beats: (v.script_segments as { beats?: string[] } | null)?.beats ?? null,
        lipsync:
          (v.script_segments as { lipsync?: string } | null)?.lipsync ?? null,
        captions:
          (v.script_segments as { captions?: boolean } | null)?.captions ?? true,
        heygen_video_id: v.heygen_video_id,
        photos,
      },
      av?.voice_id ?? null,
    );
    if (result === "completed") cinematicAssembled++;
  }

  // Hype Reels (host bookends + photo tour + music + overlays). Same backstop +
  // stale-lock reset as the cinematic pass.
  const { data: reelVideos } = await supabase
    .from("videos")
    .select("id, user_id, heygen_video_id, status, listing_id, script_segments, avatar_id")
    .in("status", ["processing", "submitting"])
    .like("heygen_video_id", "reel:%")
    .limit(20);

  let reelsAssembled = 0;
  for (const v of reelVideos ?? []) {
    if (!isHypeReel(v.heygen_video_id)) continue;
    if (v.status === "submitting") {
      await supabase
        .from("videos")
        .update({ status: "processing" })
        .eq("id", v.id)
        .eq("status", "submitting");
    }
    const { data: lst } = await supabase
      .from("listings")
      .select("*")
      .eq("id", v.listing_id ?? "")
      .maybeSingle();
    const photos = lst ? listingPhotos(lst.photos).map((p) => p.url) : [];
    const seg = v.script_segments as {
      hypeReel?: { featureCallouts?: string[]; trackId?: string };
      beats?: string[];
      lipsync?: string;
      captions?: boolean;
    } | null;
    const meta = seg?.hypeReel;
    const { data: avReel } = await supabase
      .from("avatars")
      .select("voice_id")
      .eq("id", v.avatar_id ?? "")
      .maybeSingle();
    const result = await assembleHypeReel(supabase, {
      id: v.id,
      user_id: v.user_id,
      heygen_video_id: v.heygen_video_id,
      photos,
      facts: {
        price: lst?.price
          ? `$${Math.round(Number(lst.price)).toLocaleString("en-US")}`
          : null,
        beds: lst?.beds ?? null,
        baths: lst?.baths ?? null,
        sqft: lst?.sqft ?? null,
        address: lst?.address ?? null,
      },
      featureCallouts: meta?.featureCallouts ?? [],
      trackId: meta?.trackId ?? null,
      beats: seg?.beats ?? null,
      lipsync: seg?.lipsync ?? null,
      captions: seg?.captions ?? true,
      voiceId: avReel?.voice_id ?? null,
    });
    if (result === "completed") reelsAssembled++;
  }

  return NextResponse.json({
    checked: stuck?.length ?? 0,
    reconciled,
    avatarsChecked: stuckAvatars?.length ?? 0,
    avatarsReconciled,
    cinematicChecked: cineVideos?.length ?? 0,
    cinematicAssembled,
    reelsChecked: reelVideos?.length ?? 0,
    reelsAssembled,
  });
}

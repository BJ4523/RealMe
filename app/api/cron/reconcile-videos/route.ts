import { type NextRequest, NextResponse } from "next/server";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getVideoStatus } from "@/lib/heygen/video";
import { reconcileAvatar } from "@/lib/avatars/reconcile";
import { assembleCinematicVideo, isCinematic } from "@/lib/video/cinematic";
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
    .select("id, user_id, script, heygen_video_id, status, avatar_id")
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
    const result = await assembleCinematicVideo(
      supabase,
      {
        id: v.id,
        user_id: v.user_id,
        script: v.script,
        heygen_video_id: v.heygen_video_id,
      },
      av?.voice_id ?? null,
    );
    if (result === "completed") cinematicAssembled++;
  }

  return NextResponse.json({
    checked: stuck?.length ?? 0,
    reconciled,
    avatarsChecked: stuckAvatars?.length ?? 0,
    avatarsReconciled,
    cinematicChecked: cineVideos?.length ?? 0,
    cinematicAssembled,
  });
}

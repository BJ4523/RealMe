"use server";

import { createClient } from "@/lib/supabase/server";
import { requireUser } from "@/lib/auth";
import { env } from "@/lib/env";
import { generateVideo } from "@/lib/heygen/video";
import { listingPhotos } from "@/lib/format";

export type StudioGenerateResult =
  | { videoId: string }
  | { error: "no_avatar" | "no_listing" | "generate_failed"; message?: string };

/**
 * Real Video Studio generation: takes the agent's active avatar + a real
 * listing + the (edited) script and submits a HeyGen job. Returns the internal
 * video id to poll. Demo listings (non-UUID ids) are rejected with `no_listing`.
 */
export async function studioGenerate(
  listingId: string,
  scriptText: string,
  title?: string,
): Promise<StudioGenerateResult> {
  const { userId } = await requireUser();
  const supabase = await createClient();

  const { data: avatar } = await supabase
    .from("avatars")
    .select("*")
    .eq("is_active", true)
    .maybeSingle();
  if (!avatar?.heygen_avatar_id) return { error: "no_avatar" };

  const { data: listing } = await supabase
    .from("listings")
    .select("*")
    .eq("id", listingId)
    .maybeSingle();
  if (!listing) return { error: "no_listing" };

  const photos = listingPhotos(listing.photos).map((p) => p.url);

  const { data: video, error: insErr } = await supabase
    .from("videos")
    .insert({
      user_id: userId,
      listing_id: listingId,
      avatar_id: avatar.id,
      title: title ?? listing.address,
      script: scriptText,
      status: "submitting",
      thumbnail_url: photos[0] ?? null,
    })
    .select("id")
    .single();
  if (insErr || !video) return { error: "generate_failed", message: insErr?.message };

  try {
    const result = await generateVideo({
      avatarId: avatar.heygen_avatar_id,
      voiceId: avatar.voice_id ?? undefined,
      script: scriptText,
      photoUrls: photos,
      title: title ?? listing.address ?? undefined,
      webhookUrl: `${env.siteUrl}/api/webhooks/heygen?secret=${env.heygenWebhookSecret}`,
    });
    await supabase
      .from("videos")
      .update({
        heygen_video_id: result.videoId,
        status: "processing",
      })
      .eq("id", video.id);
    return { videoId: video.id };
  } catch (e) {
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error: e instanceof Error ? e.message : "Generation failed.",
      })
      .eq("id", video.id);
    return { error: "generate_failed", message: e instanceof Error ? e.message : undefined };
  }
}

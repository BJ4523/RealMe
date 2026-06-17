"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/types/database";
import { listingPhotos } from "@/lib/format";
import {
  generateOpeningPitch,
  generateRoomNarration,
  generateHypeReelScript,
  type ReelStyle,
} from "@/lib/ai/script";
import { cloneVoice } from "@/lib/elevenlabs/client";
import { assembleAiReel, AI_PREFIX } from "@/lib/video/ai-reel";

/** The avatar fields the AI pipeline needs (not yet in generated DB types). */
type AiAvatar = Tables<"avatars"> & {
  agent_image_url?: string | null;
  el_voice_id?: string | null;
};

/**
 * Onboarding for the Runway + ElevenLabs pipeline: store the agent's reference
 * PHOTO (Runway likeness) and clone their VOICE on ElevenLabs from a sample. Both
 * are uploaded client-side to public buckets; we just persist the photo URL and
 * the resulting EL voice id on the active avatar.
 */
export async function setupAiAvatar(input: {
  agentImageUrl: string;
  voiceSampleUrl: string;
  name?: string;
}): Promise<{ ok?: boolean; error?: string }> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const voiceId = await cloneVoice(input.name ?? "Agent voice", input.voiceSampleUrl);
  if (!voiceId) return { error: "Voice cloning failed (check the sample + ElevenLabs key)." };

  const { data: existing } = await supabase
    .from("avatars")
    .select("id")
    .eq("user_id", userId)
    .eq("is_active", true)
    .maybeSingle();

  const fields = {
    agent_image_url: input.agentImageUrl,
    el_voice_id: voiceId,
  };
  if (existing) {
    await supabase.from("avatars").update(fields as never).eq("id", existing.id);
  } else {
    await supabase
      .from("avatars")
      .insert({
        user_id: userId,
        is_active: true,
        status: "ready",
        ...fields,
      } as never);
  }
  revalidatePath("/settings/avatar");
  return { ok: true };
}

/**
 * Submit a Runway + ElevenLabs reel. Builds the scene list (real listing photos,
 * in tour order) + the narration beats (Claude), stores them in script_segments,
 * marks the job `ai:` , and kicks off the assembler (cron/poll resumes it).
 */
export async function submitAiReel(
  videoId: string,
  opts: { roomCount?: number; style?: ReelStyle; trackId?: string } = {},
): Promise<{ error?: string } | void> {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(*), avatars(*)")
    .eq("id", videoId)
    .single();
  if (!video) return { error: "Video not found." };

  const listing = video.listings as Tables<"listings"> | null;
  const avatar = video.avatars as AiAvatar | null;
  const fail = async (error: string) => {
    await supabase.from("videos").update({ status: "failed", error }).eq("id", videoId);
    revalidatePath(`/videos/${videoId}`);
    return { error };
  };

  if (!avatar?.el_voice_id || !avatar.agent_image_url) {
    return fail("Set up your AI avatar (photo + voice) first.");
  }
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];
  if (photos.length === 0) return fail("Add listing photos first.");

  const style: ReelStyle = opts.style ?? "classic";
  const rooms = Math.min(Math.max(1, Math.round(opts.roomCount ?? 4)), 12);
  const exterior = photos[0];
  const backyard = photos[photos.length - 1] ?? exterior;
  const interiors = photos.slice(1, Math.max(1, photos.length - 1)).slice(0, rooms);
  const scenes = [exterior, ...interiors, backyard];

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);
  try {
    const openingPitch =
      video.script?.trim() ||
      (await generateOpeningPitch(listing as Tables<"listings">, style));
    const [hook, roomLines] = await Promise.all([
      generateHypeReelScript(listing as Tables<"listings">),
      generateRoomNarration(interiors, listing as Tables<"listings">, openingPitch, style),
    ]);
    const cta = hook.outro?.trim() || "Reach out today to come see it in person.";
    const beats = [openingPitch, ...roomLines, cta];

    await supabase
      .from("videos")
      .update({
        heygen_video_id: AI_PREFIX, // marks the AI pipeline; clips live in script_segments
        status: "processing",
        thumbnail_url: exterior,
        script_segments: {
          aiBeats: beats,
          aiScenes: scenes,
          aiClips: scenes.map(() => null),
          aiVoiceId: avatar.el_voice_id,
          aiAgentImage: avatar.agent_image_url,
          aiEnergy: style === "genz" ? 0.85 : 0.5,
          aiTrack: opts.trackId ?? null,
        } as unknown as Json,
      })
      .eq("id", videoId)
      .eq("user_id", userId);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "AI reel setup failed.");
  }

  // Kick it off now; the cron/page-poll resumes via assembleAiReel.
  const { data: latest } = await supabase
    .from("videos")
    .select("id, user_id, heygen_video_id, script_segments")
    .eq("id", videoId)
    .single();
  if (latest) await assembleAiReel(supabase, latest);
  revalidatePath(`/videos/${videoId}`);
}

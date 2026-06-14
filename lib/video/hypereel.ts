import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import {
  advanceLipsync,
  fetchBuffer,
  uploadThumbnailFromVideo,
  FULL_MS,
} from "@/lib/video/assemble";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assembleMontage, HYPE_REEL_TARGET_MS } from "@/lib/video/scenes";
import { beatTimesMs } from "@/lib/video/music/beats";
import { overlaysFromListing } from "@/lib/video/overlay";
import { getTrack } from "@/lib/video/music/tracks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Db = SupabaseClient<Database>;

export const REEL_PREFIX = "reel:";
export function isHypeReel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(REEL_PREFIX);
}
/** Encode: reel:<introV2;outroV2;accent,accent>  (accents comma-separated). */
export function encodeReelJobs(intro: string, outro: string, accents: string[]): string {
  return `${REEL_PREFIX}${intro};${outro};${accents.join(",")}`;
}
export function decodeReelJobs(id: string): {
  intro: string; outro: string; accents: string[];
} {
  const [intro = "", outro = "", acc = ""] = id.slice(REEL_PREFIX.length).split(";");
  return { intro, outro, accents: acc.split(",").filter(Boolean) };
}


export interface ReelListingFacts {
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
}

export interface AssemblableReel {
  id: string;
  user_id: string;
  heygen_video_id: string | null;
  /** Real listing photos — the faithful backbone. */
  photos: string[];
  facts: ReelListingFacts;
  featureCallouts: string[];
  trackId: string | null;
  /** Hype narration lines (joined for one TTS) and the cloned voice. */
  beats?: string[] | null;
  voiceId?: string | null;
  /** The single lipsync job id, set once the lipsync has fired. */
  lipsync?: string | null;
}

const OVERLAY_SHOW_MS = 1600;

/**
 * Hype Reel = the SAME cinematic_avatar + Lipsync-Precision pipeline as the
 * cinematic walkthrough (the twin talking in their own voice, lip-synced), with
 * MUSIC ducked under the voice + animated overlays. One-pass: stitch the silent
 * clips, host them, TTS the hype script, lipsync the whole montage, then add the
 * music bed + overlays.
 */
export async function assembleHypeReel(supabase: Db, reel: AssemblableReel): Promise<
  "processing" | "completed" | "failed"
> {
  if (!isHypeReel(reel.heygen_video_id)) return "processing";
  const { accents } = decodeReelJobs(reel.heygen_video_id!);
  try {
    const fullScript =
      (reel.beats ?? []).map((b) => b?.trim()).filter(Boolean).join(" ") ||
      "Check out this incredible home.";

    // Shared core: poll clips → stitch → TTS → one lipsync → lip-synced URL.
    const res = await advanceLipsync(supabase, {
      videoId: reel.id,
      userId: reel.user_id,
      clipIds: accents,
      fullScript,
      voiceId: reel.voiceId ?? null,
      lipsync: reel.lipsync ?? null,
    });
    if (res.status === "processing") return "processing";
    if (res.status === "failed") {
      await supabase.from("videos").update({ status: "failed", error: res.error }).eq("id", reel.id);
      return "failed";
    }

    // Ready — claim the final pass: add the MUSIC bed (ducked under the voice)
    // + animated overlays onto the lip-synced reel. This is the only thing that
    // differs from the cinematic walkthrough.
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", reel.id).eq("status", "processing").select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const storage = adminConfigured ? createAdminClient() : supabase;
    const track = getTrack(reel.trackId);
    const [lipBuf, musicBuf] = await Promise.all([
      fetchBuffer(res.videoUrl),
      readFile(resolve(track.file)),
    ]);
    const grid = beatTimesMs(track.bpm, track.beatOffsetMs, HYPE_REEL_TARGET_MS);
    const overlays = overlaysFromListing({
      ...reel.facts,
      featureCallouts: reel.featureCallouts,
      beatGrid: grid,
      showDurMs: OVERLAY_SHOW_MS,
    });
    const assembled = await assembleMontage({
      scenes: [{ kind: "video", videoBuf: lipBuf, durationMs: FULL_MS, keepAudio: true }],
      audio: { music: musicBuf, duckUnderSceneAudio: true },
      overlays,
    });

    const path = `${reel.user_id}/${reel.id}.mp4`;
    const up = await storage.storage.from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage.from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    const thumb = await uploadThumbnailFromVideo(
      storage,
      assembled,
      reel.user_id,
      reel.id,
    );

    await supabase.from("videos").update({
      status: "completed",
      video_url: signed?.signedUrl ?? null,
      ...(thumb ? { thumbnail_url: thumb } : {}),
      duration: Math.round(HYPE_REEL_TARGET_MS / 1000),
    }).eq("id", reel.id);
    return "completed";
  } catch (e) {
    await supabase.from("videos").update({
      status: "failed",
      error: e instanceof Error ? e.message : "Hype Reel assembly failed.",
    }).eq("id", reel.id);
    return "failed";
  }
}

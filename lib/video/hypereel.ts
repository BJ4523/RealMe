import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { createLipsync, getLipsyncStatus } from "@/lib/heygen/lipsync";
import { generateSpeech } from "@/lib/heygen/voice";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { assembleMontage, HYPE_REEL_TARGET_MS } from "@/lib/video/scenes";
import { roomDurationsMs, beatTimesMs } from "@/lib/video/music/beats";
import { overlaysFromListing } from "@/lib/video/overlay";
import { getTrack } from "@/lib/video/music/tracks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

/** "Play full natural length" sentinel for the keepAudio (lip-synced) scene. */
const FULL_MS = 600000;

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

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
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

const BEATS_PER_SHOT = 4;
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
    const vId = reel.voiceId ?? DEFAULT_VOICE_ID;
    const fullScript =
      (reel.beats ?? []).map((b) => b?.trim()).filter(Boolean).join(" ") ||
      "Check out this incredible home.";
    const storage = adminConfigured ? createAdminClient() : supabase;

    // STAGE A — the silent cinematic_avatar clips.
    const clipS = await Promise.all(accents.map(getCinematicClipStatus));
    if (clipS.some((s) => s.status === "failed")) {
      const reason =
        clipS.find((s) => s.status === "failed")?.error ||
        "A Hype Reel shot failed to render.";
      await supabase.from("videos").update({ status: "failed", error: reason }).eq("id", reel.id);
      return "failed";
    }
    if (clipS.some((s) => s.status !== "completed")) return "processing";
    const clipUrls = clipS.map((s) => s.videoUrl).filter(Boolean) as string[];
    if (clipUrls.length !== accents.length) return "processing";

    // STAGE B — stitch the silent clips, host, TTS the hype script, lipsync the
    // whole montage in one pass. Claim first so polls don't double-fire.
    if (!reel.lipsync) {
      const { data: claimedB } = await supabase
        .from("videos").update({ status: "submitting" })
        .eq("id", reel.id).eq("status", "processing").select("id");
      if (!claimedB || claimedB.length === 0) return "processing";

      const track = getTrack(reel.trackId);
      const durations = roomDurationsMs(track.bpm, BEATS_PER_SHOT, clipUrls.length);
      const clipBufs = await Promise.all(clipUrls.map(fetchBuffer));
      const silent = await assembleMontage({
        scenes: clipBufs.map((buf, i) => ({
          kind: "video",
          videoBuf: buf,
          durationMs: durations[Math.min(i, durations.length - 1)],
        })),
        audio: {},
      });
      const silentPath = `${reel.user_id}/${reel.id}-silent.mp4`;
      const upS = await storage.storage
        .from("video-cache")
        .upload(silentPath, silent, { contentType: "video/mp4", upsert: true });
      if (upS.error) throw new Error(`silent upload failed: ${upS.error.message}`);
      const { data: silentSigned } = await storage.storage
        .from("video-cache")
        .createSignedUrl(silentPath, 60 * 60 * 24);
      if (!silentSigned?.signedUrl) throw new Error("silent sign failed");

      const audio = await generateSpeech(fullScript, vId);
      const { lipsyncId } = await createLipsync({
        videoUrl: silentSigned.signedUrl,
        audioUrl: audio.audioUrl,
      });
      await supabase
        .from("videos")
        .update({
          status: "processing",
          script_segments: {
            hypeReel: { featureCallouts: reel.featureCallouts, trackId: reel.trackId },
            beats: reel.beats ?? [],
            lipsync: lipsyncId,
          } as unknown as never,
        })
        .eq("id", reel.id);
      return "processing";
    }

    // STAGE C — poll the lipsync, then add music (ducked under the voice) + overlays.
    const ls = await getLipsyncStatus(reel.lipsync);
    if (ls.status === "failed") {
      await supabase.from("videos").update({ status: "failed", error: ls.error ?? "Lipsync failed." }).eq("id", reel.id);
      return "failed";
    }
    if (ls.status !== "completed" || !ls.videoUrl) return "processing";

    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", reel.id).eq("status", "processing").select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const track = getTrack(reel.trackId);
    const [lipBuf, musicBuf] = await Promise.all([
      fetchBuffer(ls.videoUrl),
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

    await supabase.from("videos").update({
      status: "completed",
      video_url: signed?.signedUrl ?? null,
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

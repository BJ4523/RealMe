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
  /** Per-clip narration, 1:1 with clips: [openerBeat, roomBeats…, closerBeat]. */
  beats?: string[] | null;
  voiceId?: string | null;
  /** Burn captions onto the reel (default off). */
  captions?: boolean | null;
}


/**
 * Hype Reel = the SAME shared pipeline as the cinematic walkthrough
 * (fireBeatClips + advanceLipsync → the twin walking and talking in their own
 * voice, lip-synced per clip). The ONLY differences: its own punchy script
 * (beats) and a MUSIC bed ducked under the voice in the final pass.
 */
export async function assembleHypeReel(supabase: Db, reel: AssemblableReel): Promise<
  "processing" | "completed" | "failed"
> {
  if (!isHypeReel(reel.heygen_video_id)) return "processing";
  const { intro, outro, accents } = decodeReelJobs(reel.heygen_video_id!);
  if (!intro || !outro) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "No bookend clips were created." })
      .eq("id", reel.id);
    return "failed";
  }
  try {
    const beats = (reel.beats ?? []).map((b) => (b ?? "").trim());

    // Bookend-lipsync core: lip-sync the twin opener + closer, Ken-Burns the REAL
    // room photos with the middle voice slice, stitch the body (one continuous voice
    // baked in). Hype then adds the music bed over it.
    const res = await advanceLipsync(supabase, {
      videoId: reel.id,
      userId: reel.user_id,
      openerClip: intro,
      closerClip: outro,
      roomClips: accents, // cinematic b-roll clips (empty → Ken-Burns the real photos)
      beats,
      voiceId: reel.voiceId ?? null,
      captions: reel.captions ?? false,
    });
    if (res.status === "processing") return "processing";
    if (res.status === "failed") {
      await supabase.from("videos").update({ status: "failed", error: res.error }).eq("id", reel.id);
      return "failed";
    }

    // Ready — the body has all voice baked in and the row is already claimed
    // (submitting). Final pass: add the MUSIC bed, ducked under the body's voice.
    // No re-claim.
    const storage = adminConfigured ? createAdminClient() : supabase;
    const track = getTrack(reel.trackId);
    const [bodyBuf, musicBuf] = await Promise.all([
      fetchBuffer(res.videoUrl),
      readFile(resolve(track.file)),
    ]);
    // No burned-in text overlays — the agent is talking on camera, so the reel
    // reads clean like a real tour (no "JUST LISTED" / price chrome).
    const assembled = await assembleMontage({
      // The body already carries the voice (per-clip lipsync); keep it and duck
      // the music under it.
      scenes: [{ kind: "video", videoBuf: bodyBuf, durationMs: FULL_MS, keepAudio: true }],
      audio: { music: musicBuf, duckUnderSceneAudio: true },
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

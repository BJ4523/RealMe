import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { getVideoStatus } from "@/lib/heygen/video";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";
import { motionForIndex } from "@/lib/video/kenburns";
import { roomDurationsMs, beatTimesMs } from "@/lib/video/music/beats";
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
}

const ROOM_PHOTO_SHOTS = 3;
const BEATS_PER_SHOT = 4;
const OVERLAY_SHOW_MS = 1600;

export async function assembleHypeReel(supabase: Db, reel: AssemblableReel): Promise<
  "processing" | "completed" | "failed"
> {
  if (!isHypeReel(reel.heygen_video_id)) return "processing";
  const { intro, outro, accents } = decodeReelJobs(reel.heygen_video_id!);
  try {
    // Poll all sub-jobs: host bookends (v2) + accents (v3).
    const [introS, outroS] = await Promise.all([
      getVideoStatus(intro),
      getVideoStatus(outro),
    ]);
    const accentS = await Promise.all(accents.map(getCinematicClipStatus));
    const all = [introS, outroS, ...accentS];
    if (all.some((s) => s.status === "failed")) {
      const reason =
        ([introS, outroS].find((s) => s.status === "failed")?.error) ||
        accentS.find((s) => s.status === "failed")?.error ||
        "A Hype Reel shot failed to render.";
      await supabase.from("videos").update({ status: "failed", error: reason }).eq("id", reel.id);
      return "failed";
    }
    if (all.some((s) => s.status !== "completed")) return "processing";

    // Claim the row so only one assembler runs the heavy path.
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", reel.id).eq("status", "processing").select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const introUrl = introS.videoUrl!;
    const outroUrl = outroS.videoUrl!;
    const accentUrls = accentS.map((s) => s.videoUrl).filter(Boolean) as string[];

    const track = getTrack(reel.trackId);
    const durations = roomDurationsMs(track.bpm, BEATS_PER_SHOT, ROOM_PHOTO_SHOTS);

    const [introBuf, outroBuf, photoBufs, accentBufs, musicBuf] = await Promise.all([
      fetchBuffer(introUrl),
      fetchBuffer(outroUrl),
      Promise.all(reel.photos.slice(0, ROOM_PHOTO_SHOTS).map(fetchBuffer)),
      Promise.all(accentUrls.map(fetchBuffer)),
      readFile(resolve(track.file)),
    ]);

    // Scenes: host intro -> [photo, photo, accent, photo...] -> host outro.
    const room: MontageScene[] = [];
    let ai = 0;
    photoBufs.forEach((buf, i) => {
      room.push({ kind: "photo", imageBuf: buf, motion: motionForIndex(i), durationMs: durations[i] });
      if (ai < accentBufs.length && i === 1) {
        room.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: durations[i] });
      }
    });
    while (ai < accentBufs.length) {
      room.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: durations[durations.length - 1] });
    }

    const scenes: MontageScene[] = [
      { kind: "video", videoBuf: introBuf, durationMs: 6000, keepAudio: true },
      ...room,
      { kind: "video", videoBuf: outroBuf, durationMs: 6000, keepAudio: true },
    ];

    // Overlays land on beats within the montage (after the intro).
    const introMs = 6000;
    const montageMs = room.reduce((a, s) => a + s.durationMs, 0);
    const grid = beatTimesMs(track.bpm, track.beatOffsetMs, montageMs).map((t) => t + introMs);
    const overlays = overlaysFromListing({
      ...reel.facts,
      featureCallouts: reel.featureCallouts,
      beatGrid: grid,
      showDurMs: OVERLAY_SHOW_MS,
    });

    const assembled = await assembleMontage({
      scenes,
      audio: { music: musicBuf, duckUnderSceneAudio: true },
      overlays,
    });

    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${reel.user_id}/${reel.id}.mp4`;
    const up = await storage.storage.from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage.from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    const totalSec = Math.round((introMs + montageMs + 6000) / 1000);
    await supabase.from("videos").update({
      status: "completed",
      video_url: signed?.signedUrl ?? null,
      duration: totalSec,
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

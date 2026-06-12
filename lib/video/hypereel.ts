import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { startInSceneBookends } from "@/lib/video/bookends";
import {
  assembleMontage,
  HYPE_REEL_TARGET_MS,
  type MontageScene,
} from "@/lib/video/scenes";
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
    // Poll the AI room clips (v3) first.
    const accentS = await Promise.all(accents.map(getCinematicClipStatus));
    if (accentS.some((s) => s.status === "failed")) {
      const reason =
        accentS.find((s) => s.status === "failed")?.error ||
        "A Hype Reel shot failed to render.";
      await supabase.from("videos").update({ status: "failed", error: reason }).eq("id", reel.id);
      return "failed";
    }
    if (accentS.some((s) => s.status !== "completed")) return "processing";
    const accentUrls = accentS.map((s) => s.videoUrl).filter(Boolean) as string[];
    if (accentUrls.length !== accents.length) return "processing";

    // PHASE 1 — rooms done, bookends not started: fire the lip-synced talking
    // bookends over the COMPLETED room footage (in the scene, never a presenter
    // cutout). Claim first so concurrent polls don't double-fire.
    if (!intro || !outro) {
      const { data: claimedP1 } = await supabase
        .from("videos").update({ status: "submitting" })
        .eq("id", reel.id).eq("status", "processing").select("id");
      if (!claimedP1 || claimedP1.length === 0) return "processing";
      const jobs = await startInSceneBookends(
        supabase,
        reel.id,
        accentUrls[0],
        accentUrls[accentUrls.length - 1],
      );
      if (!jobs) {
        throw new Error("Could not start host bookends (no active twin found).");
      }
      await supabase
        .from("videos")
        .update({
          heygen_video_id: encodeReelJobs(jobs.introId, jobs.outroId, accents),
          status: "processing",
        })
        .eq("id", reel.id);
      return "processing";
    }

    // PHASE 2 — poll the bookends (v3 photo-to-video jobs).
    const [introS, outroS] = await Promise.all([
      getCinematicClipStatus(intro),
      getCinematicClipStatus(outro),
    ]);
    if ([introS, outroS].some((s) => s.status === "failed")) {
      const reason =
        [introS, outroS].find((s) => s.status === "failed")?.error ||
        "A Hype Reel host shot failed to render.";
      await supabase.from("videos").update({ status: "failed", error: reason }).eq("id", reel.id);
      return "failed";
    }
    if ([introS, outroS].some((s) => s.status !== "completed")) return "processing";

    // Claim the row so only one assembler runs the heavy path.
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", reel.id).eq("status", "processing").select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const introUrl = introS.videoUrl!;
    const outroUrl = outroS.videoUrl!;

    const track = getTrack(reel.trackId);
    const durations = roomDurationsMs(track.bpm, BEATS_PER_SHOT, ROOM_PHOTO_SHOTS);

    const [introBuf, outroBuf, roomBufs, musicBuf] = await Promise.all([
      fetchBuffer(introUrl),
      fetchBuffer(outroUrl),
      Promise.all(accentUrls.map(fetchBuffer)),
      readFile(resolve(track.file)),
    ]);

    // Scenes: host intro -> [AI room clip, AI room clip, ...] -> host outro. Each
    // room clip is the twin walking through a faithful recreation of that room,
    // beat-synced via the per-shot durations.
    const room: MontageScene[] = roomBufs.map((buf, i) => ({
      kind: "video",
      videoBuf: buf,
      durationMs: durations[Math.min(i, durations.length - 1)],
    }));

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

    // The assembler clamps the output to a fixed length (HYPE_REEL_TARGET_MS),
    // so the stored duration is the target, not the song or the scene sum.
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

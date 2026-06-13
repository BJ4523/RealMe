import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { createLipsync, getLipsyncStatus } from "@/lib/heygen/lipsync";
import { generateSpeech } from "@/lib/heygen/voice";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";

type Db = SupabaseClient<Database>;

/** Prefix marking a video whose heygen_video_id holds cinematic clip job ids. */
export const CINEMATIC_PREFIX = "cine:";

/** "Play full natural length" sentinel for keepAudio (lip-synced) scenes. */
const FULL_MS = 600000;

export function isCinematic(heygenVideoId: string | null | undefined): boolean {
  return !!heygenVideoId && heygenVideoId.startsWith(CINEMATIC_PREFIX);
}

/**
 * Encode: cine:<introV2;outroV2;room,room,...> — the two lip-synced talking-head
 * bookends (HeyGen v2) plus the Seedance room-walk clips (v3). intro/outro may be
 * empty strings if a video has no bookends.
 */
export function encodeCinematicJobs(
  intro: string,
  outro: string,
  rooms: string[],
): string {
  return `${CINEMATIC_PREFIX}${intro};${outro};${rooms.join(",")}`;
}

function decodeCinematicJobs(heygenVideoId: string): {
  intro: string;
  outro: string;
  rooms: string[];
} {
  const rest = heygenVideoId.slice(CINEMATIC_PREFIX.length);
  if (rest.includes(";")) {
    const [intro = "", outro = "", r = ""] = rest.split(";");
    return { intro, outro, rooms: r.split(",").filter(Boolean) };
  }
  // Legacy format (rooms only, no bookends).
  return { intro: "", outro: "", rooms: rest.split(",").filter(Boolean) };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

interface AssemblableVideo {
  id: string;
  user_id: string;
  script: string | null;
  /** Narration lines per beat (opener, each room, closer) — joined for one TTS. */
  beats?: string[] | null;
  /** The single lipsync job id (whole montage), set once the lipsync has fired. */
  lipsync?: string | null;
  heygen_video_id: string | null;
  /** Real listing photo URLs — the faithful backbone of the montage. */
  photos: string[];
}

/**
 * Drive a cinematic video to completion. The real listing photos are the
 * faithful backbone (Ken-Burns motion); any rendered AI accent clips are
 * interleaved (~1 per 3 photos) as flair. Once all accents (if any) are ready,
 * generate cloned-voice narration, assemble the montage server-side, upload the
 * result to the private video-cache bucket, and complete the row. Best-effort:
 * any failure marks the row failed with a reason. Returns the resulting status.
 */
export async function assembleCinematicVideo(
  supabase: Db,
  video: AssemblableVideo,
  voiceId: string | null,
): Promise<"processing" | "completed" | "failed"> {
  if (!isCinematic(video.heygen_video_id)) return "processing";
  const { rooms } = decodeCinematicJobs(video.heygen_video_id!);
  if (rooms.length === 0) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "No cinematic clips were created." })
      .eq("id", video.id);
    return "failed";
  }

  try {
    const vId = voiceId ?? DEFAULT_VOICE_ID;
    const fullScript =
      (video.beats ?? []).map((b) => b?.trim()).filter(Boolean).join(" ") ||
      video.script?.trim() ||
      "Welcome to this beautiful home.";
    const storage = adminConfigured ? createAdminClient() : supabase;

    // STAGE A — the silent cinematic_avatar clips (opener, rooms, closer).
    const clipS = await Promise.all(rooms.map(getCinematicClipStatus));
    if (clipS.some((s) => s.status === "failed")) {
      const reason =
        clipS.find((s) => s.status === "failed")?.error ??
        "A cinematic shot failed to render.";
      await supabase
        .from("videos")
        .update({ status: "failed", error: reason })
        .eq("id", video.id);
      return "failed";
    }
    if (clipS.some((s) => s.status !== "completed")) return "processing";
    const clipUrls = clipS.map((s) => s.videoUrl).filter(Boolean) as string[];
    if (clipUrls.length !== rooms.length) return "processing";

    // STAGE B — clips ready, lipsync not fired: stitch the silent clips into ONE
    // long-form video, host it, TTS the full script, and Lipsync-Precision the
    // whole thing in a SINGLE pass (lipsync is built for long-form cinematic).
    // Claim first so polls don't double-fire, then release to poll the lipsync.
    if (!video.lipsync) {
      const { data: claimedB } = await supabase
        .from("videos")
        .update({ status: "submitting" })
        .eq("id", video.id)
        .eq("status", "processing")
        .select("id");
      if (!claimedB || claimedB.length === 0) return "processing";

      const clipBufs = await Promise.all(clipUrls.map(fetchBuffer));
      const silent = await assembleMontage({
        scenes: clipBufs.map((buf) => ({
          kind: "video",
          videoBuf: buf,
          durationMs: FULL_MS,
        })),
        audio: {},
      });
      // Host the silent montage so HeyGen lipsync can fetch it (signed URL).
      const silentPath = `${video.user_id}/${video.id}-silent.mp4`;
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
          script_segments: { beats: video.beats ?? [], lipsync: lipsyncId } as unknown as never,
        })
        .eq("id", video.id);
      return "processing";
    }

    // STAGE C — poll the single lipsync job (the whole montage, lip-synced).
    const ls = await getLipsyncStatus(video.lipsync);
    if (ls.status === "failed") {
      await supabase
        .from("videos")
        .update({ status: "failed", error: ls.error ?? "Lipsync failed." })
        .eq("id", video.id);
      return "failed";
    }
    if (ls.status !== "completed" || !ls.videoUrl) return "processing";

    // Claim the final upload.
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    // The lipsync output IS the finished video (the realtor walking + talking in
    // their own voice). Re-host it in our bucket as the final.
    const assembled = await fetchBuffer(ls.videoUrl);
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);

    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        duration: null,
      })
      .eq("id", video.id);
    return "completed";
  } catch (e) {
    await supabase
      .from("videos")
      .update({
        status: "failed",
        error:
          e instanceof Error ? e.message : "Cinematic assembly failed.",
      })
      .eq("id", video.id);
    return "failed";
  }
}

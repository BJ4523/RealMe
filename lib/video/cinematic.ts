import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { DEFAULT_VOICE_ID } from "@/lib/heygen/client";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { resolveVideoAgent } from "@/lib/heygen/videoagent";
import { generateSpeech } from "@/lib/heygen/voice";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";

type Db = SupabaseClient<Database>;

/** Prefix marking a video whose heygen_video_id holds cinematic clip job ids. */
export const CINEMATIC_PREFIX = "cine:";

/** Floor per scene so each room shot is long enough to read. */
const MIN_SCENE_MS = 2500;
/** "Play full natural length" sentinel for keepAudio bookend/tour scenes. */
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
  /** Voiceover for the ROOM walk (separate from the opening pitch in `script`). */
  roomNarration?: string | null;
  /** Video Agent session ids for the lip-synced opener/closer bookends. */
  openerSession?: string | null;
  closerSession?: string | null;
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
    // The SEEDANCE room walk (silent cinematic middle) lives in `rooms`.
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

    // The lip-synced VIDEO AGENT opener + closer (their own pitch/CTA audio).
    // These render slowly (~20-45 min) — resolve session -> video -> url each
    // poll; stay "processing" until both are ready.
    const [openerR, closerR] = await Promise.all([
      video.openerSession ? resolveVideoAgent(video.openerSession) : null,
      video.closerSession ? resolveVideoAgent(video.closerSession) : null,
    ]);
    if (openerR?.status === "failed" || closerR?.status === "failed") {
      await supabase
        .from("videos")
        .update({
          status: "failed",
          error:
            openerR?.error ?? closerR?.error ?? "The opener/closer failed to render.",
        })
        .eq("id", video.id);
      return "failed";
    }
    if (openerR && openerR.status !== "completed") return "processing";
    if (closerR && closerR.status !== "completed") return "processing";

    // Claim the row (processing -> submitting) so only one assembler runs the
    // heavy download/assemble/upload.
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    // Step 1: the room walk — Seedance clips with the cloned-voice ROOM
    // narration muxed over them (the pitch/CTA are spoken by the VA bookends).
    const narration = await generateSpeech(
      video.roomNarration?.trim() ||
        video.script?.trim() ||
        "Welcome to this beautiful home.",
      voiceId ?? DEFAULT_VOICE_ID,
    );
    const clipBufs = await Promise.all(clipUrls.map(fetchBuffer));
    const perSceneMs = Math.max(
      MIN_SCENE_MS,
      Math.round(((narration.duration || 30) * 1000) / clipBufs.length),
    );
    const narrationBuf = await fetchBuffer(narration.audioUrl);
    const roomTour = await assembleMontage({
      scenes: clipBufs.map((buf) => ({
        kind: "video",
        videoBuf: buf,
        durationMs: perSceneMs,
      })),
      audio: { narration: narrationBuf },
    });

    // Step 2: stitch [opener][room tour][closer] — each keeps its own audio
    // (lip-synced pitch → room voice-over → lip-synced CTA).
    let assembled = roomTour;
    const [openerBuf, closerBuf] = await Promise.all([
      openerR?.videoUrl ? fetchBuffer(openerR.videoUrl) : Promise.resolve(null),
      closerR?.videoUrl ? fetchBuffer(closerR.videoUrl) : Promise.resolve(null),
    ]);
    if (openerBuf || closerBuf) {
      const scenes: MontageScene[] = [];
      if (openerBuf)
        scenes.push({ kind: "video", videoBuf: openerBuf, durationMs: FULL_MS, keepAudio: true });
      scenes.push({ kind: "video", videoBuf: roomTour, durationMs: FULL_MS, keepAudio: true });
      if (closerBuf)
        scenes.push({ kind: "video", videoBuf: closerBuf, durationMs: FULL_MS, keepAudio: true });
      assembled = await assembleMontage({ scenes, audio: {} });
    }

    // Upload via the service-role client: the video-cache bucket's RLS only
    // permits trusted writes, and assembly may run with the user client (from the
    // poll path), which would hit "violates row-level security policy".
    const storage = adminConfigured ? createAdminClient() : supabase;
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
        duration: Math.round(narration.duration) || null,
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

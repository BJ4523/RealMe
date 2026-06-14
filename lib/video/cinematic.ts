import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import {
  advanceLipsync,
  fetchBuffer,
  uploadThumbnailFromVideo,
  FULL_MS,
} from "@/lib/video/assemble";
import { assembleMontage } from "@/lib/video/scenes";

type Db = SupabaseClient<Database>;

/** Prefix marking a video whose heygen_video_id holds cinematic clip job ids. */
export const CINEMATIC_PREFIX = "cine:";

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


interface AssemblableVideo {
  id: string;
  user_id: string;
  script: string | null;
  /** Narration lines per beat (opener, each room, closer) — joined for one TTS. */
  beats?: string[] | null;
  /** The single lipsync job id (whole montage), set once the lipsync has fired. */
  lipsync?: string | null;
  /** Burn captions onto the reel (default true). */
  captions?: boolean | null;
  /** Hosted cloned-voice narration (authoritative audio for the final mux). */
  narration?: string | null;
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
    const fullScript =
      (video.beats ?? []).map((b) => b?.trim()).filter(Boolean).join(" ") ||
      video.script?.trim() ||
      "Welcome to this beautiful home.";

    // Shared core: poll clips → stitch → TTS → one lipsync → lip-synced URL.
    const res = await advanceLipsync(supabase, {
      videoId: video.id,
      userId: video.user_id,
      clipIds: rooms,
      fullScript,
      voiceId,
      lipsync: video.lipsync ?? null,
      captions: video.captions ?? true,
    });
    if (res.status === "processing") return "processing";
    if (res.status === "failed") {
      await supabase
        .from("videos")
        .update({ status: "failed", error: res.error })
        .eq("id", video.id);
      return "failed";
    }

    // Ready — claim the final, then re-host the lip-synced video as the result.
    // (Cinematic needs no extra pass; the lipsync output IS the finished reel.)
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    // Mux the cloned-voice narration over the lip-synced visuals. We do NOT rely
    // on the lipsync output's own audio track (it can come back silent — the
    // "no voice" bug); the narration is the authoritative voice. Falls back to
    // re-hosting as-is only if we somehow have no narration.
    const lipBuf = await fetchBuffer(res.videoUrl);
    const narrBuf = video.narration ? await fetchBuffer(video.narration) : null;
    const assembled = narrBuf
      ? await assembleMontage({
          scenes: [{ kind: "video", videoBuf: lipBuf, durationMs: FULL_MS }],
          audio: { narration: narrBuf },
        })
      : lipBuf;
    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);

    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    // Poster frame from the finished reel (clean still of the agent, not a
    // low-res listing photo).
    const thumb = await uploadThumbnailFromVideo(
      storage,
      assembled,
      video.user_id,
      video.id,
    );

    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        ...(thumb ? { thumbnail_url: thumb } : {}),
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

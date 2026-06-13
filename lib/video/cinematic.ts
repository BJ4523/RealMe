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
  /** One narration line per clip (opener, each room, closer) — lip-synced. */
  beats?: string[] | null;
  /** Lipsync job ids (one per clip), set once the lipsync stage has fired. */
  lipsyncs?: string[] | null;
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
    const beats = video.beats ?? [];

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

    // STAGE B — clips are ready but lipsync hasn't fired: TTS each beat in the
    // cloned voice and Lipsync-Precision it onto its clip. Claim first so polls
    // don't double-fire, then release back to `processing` to poll the lipsyncs.
    if (!video.lipsyncs?.length) {
      const { data: claimedB } = await supabase
        .from("videos")
        .update({ status: "submitting" })
        .eq("id", video.id)
        .eq("status", "processing")
        .select("id");
      if (!claimedB || claimedB.length === 0) return "processing";

      const lipsyncIds: string[] = [];
      for (let i = 0; i < clipUrls.length; i++) {
        const line = beats[i]?.trim() || "Take a look at this beautiful space.";
        const audio = await generateSpeech(line, vId);
        const { lipsyncId } = await createLipsync({
          videoUrl: clipUrls[i],
          audioUrl: audio.audioUrl,
        });
        lipsyncIds.push(lipsyncId);
      }
      await supabase
        .from("videos")
        .update({
          status: "processing",
          script_segments: { beats, lipsyncs: lipsyncIds } as unknown as never,
        })
        .eq("id", video.id);
      return "processing";
    }

    // STAGE C — poll the lipsync jobs (each = a clip lip-synced to its line).
    const lsS = await Promise.all(video.lipsyncs.map(getLipsyncStatus));
    if (lsS.some((s) => s.status === "failed")) {
      const reason =
        lsS.find((s) => s.status === "failed")?.error ?? "A lipsync job failed.";
      await supabase
        .from("videos")
        .update({ status: "failed", error: reason })
        .eq("id", video.id);
      return "failed";
    }
    if (lsS.some((s) => s.status !== "completed")) return "processing";
    const lsUrls = lsS.map((s) => s.videoUrl).filter(Boolean) as string[];
    if (lsUrls.length !== video.lipsyncs.length) return "processing";

    // Claim the heavy stitch/upload.
    const { data: claimed } = await supabase
      .from("videos")
      .update({ status: "submitting" })
      .eq("id", video.id)
      .eq("status", "processing")
      .select("id");
    if (!claimed || claimed.length === 0) return "processing";

    // Stitch the lip-synced clips in order — each keeps its OWN baked audio
    // (the cloned voice, lip-synced). No separate voice-over track.
    const lsBufs = await Promise.all(lsUrls.map(fetchBuffer));
    const scenes: MontageScene[] = lsBufs.map((buf) => ({
      kind: "video",
      videoBuf: buf,
      durationMs: FULL_MS,
      keepAudio: true,
    }));
    const assembled = await assembleMontage({ scenes, audio: {} });

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

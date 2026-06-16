import "server-only";
import { ENDPOINTS, heygenFetch, isMock, MOCK_VIDEO_URL } from "./client";

/**
 * HeyGen Lipsync — Precision (`POST /v3/lipsyncs`, mode: "precision"): re-syncs
 * the mouth on ANY source video to ANY replacement audio. This is what turns a
 * SILENT cinematic_avatar clip (the twin, keeping likeness, moving cinematically)
 * into the twin TALKING in their own cloned voice — lip-synced. Frame-accurate,
 * best for cinematic/long-form. Async: returns a lipsync_id; poll for the URL.
 *
 * Verified live: POST returns 202 { lipsync_id }; GET /v3/lipsyncs/{id} returns
 * status + the output video_url.
 */
export async function createLipsync(input: {
  videoUrl: string;
  audioUrl: string;
  /** Burn captions onto the output (agent's choice; default on). */
  enableCaption?: boolean;
}): Promise<{ lipsyncId: string }> {
  if (isMock) {
    return { lipsyncId: `mock_ls_${Math.abs(hash(input.videoUrl)).toString(36)}` };
  }
  const res = await heygenFetch<{ data: { lipsync_id: string } }>(
    ENDPOINTS.lipsyncs,
    {
      method: "POST",
      json: {
        video: { type: "url", url: input.videoUrl },
        audio: { type: "url", url: input.audioUrl },
        // precision = avatar-inference lip-sync (high quality); re-animates the
        // speaker's mouth to match the audio. "speed" is the cheaper/rougher mode.
        mode: "precision",
        // Preserve the source clip's resolution + bitrate (the cinematic clips are
        // 1080p) instead of letting lipsync downscale the output.
        keep_the_same_format: true,
        // Let the clip stretch/trim to the narration length so the mouth and
        // voice line up end-to-end.
        enable_dynamic_duration: true,
        // Clean up the cloned-voice track (reduce artifacts/noise).
        enable_speech_enhancement: true,
        // Captions: social reels are watched muted; default on, toggleable.
        enable_caption: input.enableCaption ?? true,
      },
    },
  );
  return { lipsyncId: res.data.lipsync_id };
}

export interface LipsyncStatus {
  status: "processing" | "completed" | "failed";
  videoUrl?: string;
  error?: string;
}

/** Poll a lipsync job (GET /v3/lipsyncs/{id}). */
export async function getLipsyncStatus(lipsyncId: string): Promise<LipsyncStatus> {
  if (isMock) return { status: "completed", videoUrl: MOCK_VIDEO_URL };
  try {
    const res = await heygenFetch<{
      data?: {
        status?: string;
        video_url?: string;
        // HeyGen surfaces the real reason in `failure_message` (not `error`).
        failure_message?: string | null;
        error?: string | { message?: string } | null;
      };
    }>(ENDPOINTS.lipsyncStatus(lipsyncId));
    const d = res.data ?? {};
    const s = (d.status ?? "").toLowerCase();
    const status =
      s === "completed" || s === "success"
        ? "completed"
        : s === "failed" || s === "error"
          ? "failed"
          : "processing";
    const error =
      d.failure_message ??
      (typeof d.error === "string" ? d.error : (d.error?.message ?? undefined));
    return { status, videoUrl: d.video_url, error };
  } catch (e) {
    return { status: "processing", error: e instanceof Error ? e.message : undefined };
  }
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
  return h;
}

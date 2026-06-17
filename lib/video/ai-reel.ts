import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assembleMontage } from "@/lib/video/scenes";
import {
  fetchBuffer,
  hostAudio,
  padAudioToClip,
  uploadThumbnailFromVideo,
} from "@/lib/video/assemble";
import { composeAgentFrame, animateClip, isRunwayConfigured } from "@/lib/runway/client";
import { speak, isElevenConfigured } from "@/lib/elevenlabs/client";
import { createLipsync, getLipsyncStatus } from "@/lib/heygen/lipsync";
import { getTrack } from "@/lib/video/music/tracks";

type Db = SupabaseClient<Database>;
type Storage = ReturnType<typeof createAdminClient>;

/** Marks a video built by the Runway + ElevenLabs + lipsync pipeline. */
export const AI_PREFIX = "ai:";
export function isAiReel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(AI_PREFIX);
}

const FULL_MS = 600000;
const TIME_BUDGET_MS = 240_000; // headroom under the 300s cap; cron resumes the rest.

interface AiReelState {
  aiBeats?: string[];
  aiScenes?: string[]; // listing photo per scene
  aiClips?: (string | null)[]; // Runway clip URL per scene
  aiLipsyncs?: (string | null)[]; // HeyGen lipsync id per scene
  aiNarr?: (string | null)[]; // hosted+fitted VO url per scene (lipsync input + fallback)
  aiVoiceId?: string; // ElevenLabs voice id
  aiAgentImage?: string; // Runway likeness reference
  aiEnergy?: number;
  aiTrack?: string | null;
}

// Face-to-camera prompts — the agent must be talking to the lens the whole clip so
// the lipsync pass has a detectable speaking face.
function framePrompt(index: number, total: number): string {
  const where =
    index === 0
      ? "in front of the house"
      : index === total - 1
        ? "in the backyard / outdoor space"
        : "inside the room";
  return (
    `A photorealistic real-estate agent (@agent) ${where} shown in @scene, facing the ` +
    `camera. Keep @agent's exact face and likeness; place them naturally into @scene ` +
    `with matching light and perspective. Head and shoulders clearly visible, bright, crisp.`
  );
}
function motionPrompt(): string {
  return (
    "The agent talks warmly to the camera, mouth moving naturally, gesturing as they " +
    "present — face fully visible and toward the lens the entire time. Smooth gimbal, " +
    "bright daylight, being filmed (not a selfie, hands free)."
  );
}

async function hostBuffer(
  storage: Storage,
  buf: Buffer,
  path: string,
  contentType: string,
): Promise<string | null> {
  const up = await storage.storage
    .from("video-cache")
    .upload(path, buf, { contentType, upsert: true });
  if (up.error) return null;
  const { data } = await storage.storage
    .from("video-cache")
    .createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

/**
 * Drive a Runway + ElevenLabs + lipsync reel to completion. Per scene: Runway
 * renders the agent face-to-camera in the room (gen4_image → gen4.5), ElevenLabs
 * speaks the beat expressively, HeyGen Lipsync-Precision syncs the mouth to that
 * voice on the realistic Runway footage. Idempotent + cron-resumable.
 */
export async function assembleAiReel(
  supabase: Db,
  video: {
    id: string;
    user_id: string;
    heygen_video_id: string | null;
    script_segments: unknown;
  },
): Promise<"processing" | "completed" | "failed"> {
  if (!isAiReel(video.heygen_video_id)) return "processing";
  if (!isRunwayConfigured() || !isElevenConfigured()) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "Runway/ElevenLabs not configured." })
      .eq("id", video.id);
    return "failed";
  }

  const storage = (adminConfigured ? createAdminClient() : supabase) as Storage;
  const s = (video.script_segments as AiReelState | null) ?? {};
  const beats = s.aiBeats ?? [];
  const scenes = s.aiScenes ?? [];
  const agentImage = s.aiAgentImage;
  const voiceId = s.aiVoiceId;
  const energy = s.aiEnergy ?? 0.5;
  // Image is required (Runway needs the likeness); voice is OPTIONAL — without it we
  // render a silent Runway-only reel so the video flow can be tested on its own.
  if (!scenes.length || !agentImage) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "Missing scene/agent photo for AI reel." })
      .eq("id", video.id);
    return "failed";
  }

  const fail = async (msg: string) => {
    await supabase.from("videos").update({ status: "failed", error: msg }).eq("id", video.id);
    return "failed" as const;
  };
  const saveSeg = async (patch: Partial<AiReelState>) => {
    const { data: row } = await supabase
      .from("videos").select("script_segments").eq("id", video.id).maybeSingle();
    const seg = (row?.script_segments as Record<string, unknown> | null) ?? {};
    await supabase
      .from("videos")
      .update({ script_segments: { ...seg, ...patch } as never })
      .eq("id", video.id);
  };
  const finalize = async (buf: Buffer): Promise<"completed"> => {
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache").upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage
      .from("video-cache").createSignedUrl(path, 60 * 60 * 24 * 7);
    const thumb = await uploadThumbnailFromVideo(storage, buf, video.user_id, video.id);
    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        ...(thumb ? { thumbnail_url: thumb } : {}),
      })
      .eq("id", video.id);
    return "completed";
  };

  const beatFor = (i: number) =>
    (beats[i] || (i === 0 ? "Welcome — come take a look at this home." : "Take a look at this space.")).trim();

  try {
    // STAGE A — render any missing Runway clips (compose agent→scene, animate).
    const clips = [...(s.aiClips ?? Array(scenes.length).fill(null))];
    const startedA = Date.now();
    for (let i = 0; i < scenes.length; i++) {
      if (clips[i]) continue;
      if (Date.now() - startedA > TIME_BUDGET_MS) return "processing";
      const words = beatFor(i).split(/\s+/).filter(Boolean).length || 12;
      const durationSec = Math.min(10, Math.max(3, Math.round(words / 2.5)));
      const frame = await composeAgentFrame({
        agentImageUrl: agentImage,
        sceneImageUrl: scenes[i],
        promptText: framePrompt(i, scenes.length),
      });
      const clip = frame
        ? await animateClip({ firstFrameUrl: frame, promptText: motionPrompt(), durationSec })
        : null;
      if (!clip) return fail("A Runway scene failed to render.");
      clips[i] = clip;
      await saveSeg({ aiClips: clips });
    }
    if (clips.some((c) => !c)) return "processing";

    // NO VOICE (Runway-only test) — stitch the silent clips and finish.
    if (!voiceId) {
      const { data: claimedV } = await supabase
        .from("videos").update({ status: "submitting" })
        .eq("id", video.id).eq("status", "processing").select("id");
      if (!claimedV?.length) return "processing";
      const bufs = await Promise.all(clips.map((c) => fetchBuffer(c as string)));
      const track0 = s.aiTrack ? getTrack(s.aiTrack) : null;
      const music0 = track0 ? await readFile(resolve(track0.file)).catch(() => null) : null;
      const out = await assembleMontage({
        scenes: bufs.map((b) => ({ kind: "video" as const, videoBuf: b, durationMs: FULL_MS, keepAudio: !music0 })),
        audio: music0 ? { music: music0 } : {},
      });
      return finalize(out);
    }

    // STAGE B — per clip: ElevenLabs VO → fit → fire HeyGen lipsync.
    if (!s.aiLipsyncs || s.aiLipsyncs.length === 0) {
      const lipsyncs: (string | null)[] = [];
      const narr: (string | null)[] = [];
      for (let i = 0; i < clips.length; i++) {
        const vo = await speak(beatFor(i), voiceId, { energy });
        const rawUrl = await hostBuffer(storage, vo.audio, `${video.user_id}/${video.id}-vo${i}.mp3`, "audio/mpeg");
        if (!rawUrl) return fail("Voice hosting failed.");
        const fitted = await padAudioToClip(storage, clips[i] as string, rawUrl, `${video.user_id}/${video.id}-n${i}`);
        const ls = await createLipsync({ videoUrl: clips[i] as string, audioUrl: fitted, enableCaption: false });
        lipsyncs.push(ls.lipsyncId);
        narr.push(fitted);
      }
      await saveSeg({ aiLipsyncs: lipsyncs, aiNarr: narr });
      return "processing";
    }

    // STAGE C — poll lipsyncs; once all resolve, stitch.
    const statuses = await Promise.all(s.aiLipsyncs.map((id) => (id ? getLipsyncStatus(id) : Promise.resolve({ status: "failed" as const }))));
    if (statuses.some((st) => st.status === "processing")) return "processing";

    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", video.id).eq("status", "processing").select("id");
    if (!claimed?.length) return "processing";

    const narr = s.aiNarr ?? [];
    const segments = await Promise.all(
      clips.map(async (clipUrl, i) => {
        const st = statuses[i];
        if (st && st.status === "completed" && st.videoUrl) return fetchBuffer(st.videoUrl);
        // Lipsync failed → fall back to the raw Runway clip with its VO muxed.
        const clipBuf = await fetchBuffer(clipUrl as string);
        const voUrl = narr[i];
        const voBuf = voUrl ? await fetchBuffer(voUrl).catch(() => null) : null;
        if (!voBuf) return clipBuf;
        return assembleMontage({
          scenes: [{ kind: "video" as const, videoBuf: clipBuf, durationMs: FULL_MS }],
          audio: { narration: voBuf },
        });
      }),
    );

    const track = s.aiTrack ? getTrack(s.aiTrack) : null;
    const music = track ? await readFile(resolve(track.file)).catch(() => null) : null;
    const final = await assembleMontage({
      scenes: segments.map((b) => ({ kind: "video" as const, videoBuf: b, durationMs: FULL_MS, keepAudio: true })),
      audio: music ? { music, duckUnderSceneAudio: true } : {},
    });
    return finalize(final);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "AI reel assembly failed.");
  }
}

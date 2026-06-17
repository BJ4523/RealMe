import "server-only";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assembleMontage } from "@/lib/video/scenes";
import { fetchBuffer, uploadThumbnailFromVideo } from "@/lib/video/assemble";
import {
  composeAgentFrame,
  animateClip,
  isRunwayConfigured,
} from "@/lib/runway/client";
import { speak, isElevenConfigured } from "@/lib/elevenlabs/client";
import { getTrack } from "@/lib/video/music/tracks";

type Db = SupabaseClient<Database>;

/** Marks a video built by the Runway + ElevenLabs pipeline (no HeyGen). */
export const AI_PREFIX = "ai:";
export function isAiReel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(AI_PREFIX);
}

const FULL_MS = 600000; // "natural length" sentinel for the montage helper.
// Leave headroom under the 300s function cap; the cron resumes any scenes we
// don't finish in one invocation (each completed clip is persisted, so it's
// idempotent — a resume skips clips that already rendered).
const TIME_BUDGET_MS = 240_000;

interface AiReelState {
  /** One spoken line per scene, in order: [opener, rooms…, closer]. */
  aiBeats?: string[];
  /** Listing photo URL per scene (the room/exterior each clip recreates). */
  aiScenes?: string[];
  /** Rendered Runway clip URL per scene; fills in as they complete. */
  aiClips?: (string | null)[];
  /** ElevenLabs voice id (the agent's clone). */
  aiVoiceId?: string;
  /** Agent reference photo (Runway likeness anchor). */
  aiAgentImage?: string;
  /** Narration energy 0–1 (Gen-Z/hype high, classic lower). */
  aiEnergy?: number;
  /** Music track id (set for the music/hype variant). */
  aiTrack?: string | null;
}

/** Per-scene Runway prompts: a still of the agent in the room, then the motion. */
function framePrompt(index: number, total: number): string {
  const where =
    index === 0
      ? "standing in front of the house"
      : index === total - 1
        ? "standing in the backyard / outdoor space"
        : "standing inside the room";
  return (
    `A photorealistic real estate agent (@agent), ${where} shown in @scene. ` +
    `Keep @agent's exact face and likeness; place them naturally into @scene with ` +
    `matching lighting and perspective, full body, bright and crisp.`
  );
}
function motionPrompt(index: number, total: number): string {
  if (index === 0)
    return "The agent walks toward the camera presenting the home; smooth gimbal push-in, bright daylight, being filmed (no phone, hands free).";
  if (index === total - 1)
    return "The agent gestures warmly to the outdoor space then to the camera; smooth gimbal move, being filmed.";
  return "The agent walks through the room presenting it to the camera; smooth gimbal follow, being filmed, hands free.";
}

/**
 * Drive a Runway + ElevenLabs reel to completion. Voiceover-style: Runway renders
 * the agent in each scene (silent), ElevenLabs narrates expressively, ffmpeg muxes
 * + stitches. NO lipsync. Idempotent + cron-drivable: clips persist as they render,
 * and the final stitch self-locks (processing → submitting). Returns the status.
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

  const storage = adminConfigured ? createAdminClient() : supabase;
  const s = (video.script_segments as AiReelState | null) ?? {};
  const beats = s.aiBeats ?? [];
  const scenes = s.aiScenes ?? [];
  const agentImage = s.aiAgentImage;
  const voiceId = s.aiVoiceId;
  if (!scenes.length || !agentImage || !voiceId) {
    await supabase
      .from("videos")
      .update({ status: "failed", error: "Missing scene/agent/voice for AI reel." })
      .eq("id", video.id);
    return "failed";
  }

  const fail = async (msg: string) => {
    await supabase.from("videos").update({ status: "failed", error: msg }).eq("id", video.id);
    return "failed" as const;
  };

  try {
    // STAGE A — render any missing Runway clips (compose agent→scene, animate).
    const clips = [...(s.aiClips ?? Array(scenes.length).fill(null))];
    const started = Date.now();
    let madeProgress = false;
    for (let i = 0; i < scenes.length; i++) {
      if (clips[i]) continue;
      if (Date.now() - started > TIME_BUDGET_MS) break; // cron resumes the rest
      const clip = await generateSceneClip(agentImage, scenes[i], beats[i] ?? "", i, scenes.length);
      if (!clip) return fail("A Runway scene failed to render.");
      clips[i] = clip;
      madeProgress = true;
      // Persist incrementally so a timeout/crash never loses a rendered clip.
      const { data: row } = await supabase
        .from("videos").select("script_segments").eq("id", video.id).maybeSingle();
      const seg = (row?.script_segments as Record<string, unknown> | null) ?? {};
      await supabase
        .from("videos")
        .update({ script_segments: { ...seg, aiClips: clips } as never })
        .eq("id", video.id);
    }
    if (clips.some((c) => !c)) return "processing"; // more scenes next tick

    // STAGE B — claim, then narrate + stitch (the heavy ffmpeg pass).
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", video.id).eq("status", "processing").select("id");
    if (!claimed?.length) return "processing";

    // Per scene: mux the expressive VO over the (silent) Runway clip.
    const segments = await Promise.all(
      clips.map(async (clipUrl, i) => {
        const clipBuf = await fetchBuffer(clipUrl as string);
        const line = (beats[i] ?? "").trim();
        if (!line) return clipBuf;
        const vo = await speak(line, voiceId, { energy: s.aiEnergy ?? 0.5 });
        return assembleMontage({
          scenes: [{ kind: "video" as const, videoBuf: clipBuf, durationMs: FULL_MS }],
          audio: { narration: vo.audio },
        });
      }),
    );

    // Stitch the narrated segments; add a ducked music bed for the music variant.
    const bodyScenes = segments.map((b) => ({
      kind: "video" as const,
      videoBuf: b,
      durationMs: FULL_MS,
      keepAudio: true,
    }));
    const track = s.aiTrack ? getTrack(s.aiTrack) : null;
    const music = track ? await readFile(resolve(track.file)).catch(() => null) : null;
    const final = await assembleMontage({
      scenes: bodyScenes,
      audio: music ? { music, duckUnderSceneAudio: true } : {},
    });

    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache").upload(path, final, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage
      .from("video-cache").createSignedUrl(path, 60 * 60 * 24 * 7);
    const thumb = await uploadThumbnailFromVideo(storage, final, video.user_id, video.id);

    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        ...(thumb ? { thumbnail_url: thumb } : {}),
      })
      .eq("id", video.id);
    return "completed";
  } catch (e) {
    return fail(e instanceof Error ? e.message : "AI reel assembly failed.");
  }

  function generateSceneClip(
    agent: string,
    scene: string,
    beat: string,
    i: number,
    total: number,
  ): Promise<string | null> {
    // Clip length tracks the narration (~2.5 wps), clamped to Runway's 2–10s.
    const words = beat.trim().split(/\s+/).filter(Boolean).length || 12;
    const durationSec = Math.min(10, Math.max(3, Math.round(words / 2.5)));
    return composeAgentFrame({
      agentImageUrl: agent,
      sceneImageUrl: scene,
      promptText: framePrompt(i, total),
    }).then((frame) =>
      frame
        ? animateClip({ firstFrameUrl: frame, promptText: motionPrompt(i, total), durationSec })
        : null,
    );
  }
}

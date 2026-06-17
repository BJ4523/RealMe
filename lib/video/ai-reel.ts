import "server-only";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { execFile } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { assembleMontage } from "@/lib/video/scenes";
import { fetchBuffer, uploadThumbnailFromVideo } from "@/lib/video/assemble";
import { composeAgentFrame, animateClip, isRunwayConfigured } from "@/lib/runway/client";
import { speak, isElevenConfigured } from "@/lib/elevenlabs/client";
import { getTrack } from "@/lib/video/music/tracks";

type Db = SupabaseClient<Database>;
type Storage = ReturnType<typeof createAdminClient>;

/** Marks a video built by the Runway + ElevenLabs pipeline (voiceover, no HeyGen). */
export const AI_PREFIX = "ai:";
export function isAiReel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(AI_PREFIX);
}

const FULL_MS = 600000;
const TIME_BUDGET_MS = 240_000;
const RUNWAY_MIN = 3;
const RUNWAY_MAX = 10; // gen4.5 clip cap (seconds)

interface AiReelState {
  aiBeats?: string[];
  aiScenes?: string[]; // listing photo per scene
  aiClips?: (string | null)[]; // Runway clip URL per scene
  aiVoiceId?: string;
  aiAgentImage?: string;
  aiEnergy?: number;
  aiTrack?: string | null;
  aiAudioUrl?: string; // ONE continuous narration track (the whole script)
  aiAudioDur?: number; // its duration (seconds) — drives clip sizing
}

function framePrompt(index: number, total: number): string {
  const where =
    index === 0
      ? "in front of the house"
      : index === total - 1
        ? "in the backyard / outdoor space"
        : "inside the room";
  return (
    `A photorealistic real-estate agent (@agent) ${where} shown in @scene, facing the ` +
    `camera. Keep @agent's exact face and likeness; place them naturally into @scene with ` +
    `matching light and perspective. Bright, crisp, full body visible.`
  );
}
function motionPrompt(): string {
  return (
    "The agent presents the space to the camera — walking and gesturing naturally, warm " +
    "and upbeat. Smooth gimbal, bright daylight, being filmed (not a selfie, hands free)."
  );
}

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length || 1;

function probeDurSec(path: string): Promise<number> {
  if (!ffmpegPath) return Promise.resolve(0);
  return new Promise((res) =>
    execFile(ffmpegPath as string, ["-i", path], (_e, _so, se) => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(se || "");
      res(m ? +m[1] * 3600 + +m[2] * 60 + parseFloat(m[3]) : 0);
    }),
  );
}
async function probeBufferDur(buf: Buffer): Promise<number> {
  const dir = await mkdtemp(join(tmpdir(), "aidur-"));
  try {
    const p = join(dir, "a.mp3");
    await writeFile(p, buf);
    return await probeDurSec(p);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

async function hostBuffer(storage: Storage, buf: Buffer, path: string, ct: string): Promise<string | null> {
  const up = await storage.storage.from("video-cache").upload(path, buf, { contentType: ct, upsert: true });
  if (up.error) return null;
  const { data } = await storage.storage.from("video-cache").createSignedUrl(path, 60 * 60 * 24);
  return data?.signedUrl ?? null;
}

/**
 * Runway + ElevenLabs reel — ONE continuous voice over the whole video (voiceover,
 * NO lipsync, NO HeyGen). The full script is spoken in a single ElevenLabs take (so
 * the pace is consistent — no per-clip speed drift), each Runway clip is sized to its
 * word-count share of that take's duration so the visuals track the narration, and the
 * one voice is laid over the stitched clips. Idempotent + cron-resumable.
 */
export async function assembleAiReel(
  supabase: Db,
  video: { id: string; user_id: string; heygen_video_id: string | null; script_segments: unknown },
): Promise<"processing" | "completed" | "failed"> {
  if (!isAiReel(video.heygen_video_id)) return "processing";
  if (!isRunwayConfigured()) {
    await supabase.from("videos").update({ status: "failed", error: "Runway not configured." }).eq("id", video.id);
    return "failed";
  }
  const storage = (adminConfigured ? createAdminClient() : supabase) as Storage;
  const s = (video.script_segments as AiReelState | null) ?? {};
  const beats = (s.aiBeats ?? []).map((b) => (b ?? "").trim());
  const scenes = s.aiScenes ?? [];
  const agentImage = s.aiAgentImage;
  const voiceId = s.aiVoiceId;
  const energy = s.aiEnergy ?? 0.5;
  if (!scenes.length || !agentImage) {
    await supabase.from("videos").update({ status: "failed", error: "Missing scene/agent photo." }).eq("id", video.id);
    return "failed";
  }

  const fail = async (msg: string) => {
    await supabase.from("videos").update({ status: "failed", error: msg }).eq("id", video.id);
    return "failed" as const;
  };
  const saveSeg = async (patch: Partial<AiReelState>) => {
    const { data: row } = await supabase.from("videos").select("script_segments").eq("id", video.id).maybeSingle();
    const seg = (row?.script_segments as Record<string, unknown> | null) ?? {};
    await supabase.from("videos").update({ script_segments: { ...seg, ...patch } as never }).eq("id", video.id);
  };
  const finalize = async (buf: Buffer): Promise<"completed"> => {
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage.from("video-cache").upload(path, buf, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage.from("video-cache").createSignedUrl(path, 60 * 60 * 24 * 7);
    const thumb = await uploadThumbnailFromVideo(storage, buf, video.user_id, video.id);
    await supabase.from("videos").update({
      status: "completed",
      video_url: signed?.signedUrl ?? null,
      ...(thumb ? { thumbnail_url: thumb } : {}),
    }).eq("id", video.id);
    return "completed";
  };

  try {
    // STAGE 0 — one continuous ElevenLabs take of the WHOLE script (the master pace).
    let audioUrl = s.aiAudioUrl ?? null;
    let audioDur = s.aiAudioDur ?? 0;
    if (voiceId && isElevenConfigured() && !audioUrl) {
      const full = beats.filter(Boolean).join("  ");
      const vo = await speak(full, voiceId, { energy });
      audioUrl = await hostBuffer(storage, vo.audio, `${video.user_id}/${video.id}-vo.mp3`, "audio/mpeg");
      if (!audioUrl) return fail("Voice hosting failed.");
      audioDur = await probeBufferDur(vo.audio);
      await saveSeg({ aiAudioUrl: audioUrl, aiAudioDur: audioDur });
    }

    // STAGE A — render Runway clips, each sized to its word-count share of the take.
    const totalWords = beats.reduce((n, b) => n + wordCount(b), 0) || scenes.length;
    const clips = [...(s.aiClips ?? Array(scenes.length).fill(null))];
    const startedA = Date.now();
    for (let i = 0; i < scenes.length; i++) {
      if (clips[i]) continue;
      if (Date.now() - startedA > TIME_BUDGET_MS) return "processing";
      const w = wordCount(beats[i] ?? "");
      const dur = audioDur
        ? Math.min(RUNWAY_MAX, Math.max(RUNWAY_MIN, Math.ceil((audioDur * w) / totalWords)))
        : Math.min(RUNWAY_MAX, Math.max(RUNWAY_MIN, Math.round(w / 2.5)));
      const frame = await composeAgentFrame({
        agentImageUrl: agentImage,
        sceneImageUrl: scenes[i],
        promptText: framePrompt(i, scenes.length),
      });
      const clip = frame ? await animateClip({ firstFrameUrl: frame, promptText: motionPrompt(), durationSec: dur }) : null;
      if (!clip) return fail("A Runway scene failed to render.");
      clips[i] = clip;
      await saveSeg({ aiClips: clips });
    }
    if (clips.some((c) => !c)) return "processing";

    // STAGE B — claim, stitch the silent clips, lay the ONE voice over the whole.
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", video.id).eq("status", "processing").select("id");
    if (!claimed?.length) return "processing";

    const bufs = await Promise.all(clips.map((c) => fetchBuffer(c as string)));
    const sceneList = bufs.map((b) => ({ kind: "video" as const, videoBuf: b, durationMs: FULL_MS }));
    const narration = audioUrl ? await fetchBuffer(audioUrl).catch(() => null) : null;
    const track = s.aiTrack ? getTrack(s.aiTrack) : null;
    const music = track ? await readFile(resolve(track.file)).catch(() => null) : null;

    const final = narration
      ? await assembleMontage({ scenes: sceneList, audio: { narration, ...(music ? { music } : {}) } })
      : await assembleMontage({
          scenes: bufs.map((b) => ({ kind: "video" as const, videoBuf: b, durationMs: FULL_MS, keepAudio: !music })),
          audio: music ? { music } : {},
        });
    return finalize(final);
  } catch (e) {
    return fail(e instanceof Error ? e.message : "AI reel assembly failed.");
  }
}

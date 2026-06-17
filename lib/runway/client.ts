import "server-only";
import RunwayML from "@runwayml/sdk";
import { env } from "@/lib/env";

/**
 * Runway — realistic agent-in-scene footage (replaces HeyGen's Seedance
 * cinematic_avatar). Two steps, both via the official SDK:
 *   1. compose a FIRST FRAME with the agent placed in the room (gen4_image, using
 *      the agent photo + the listing photo as tagged reference images), then
 *   2. animate that frame into a short cinematic clip (gen4.5 image-to-video).
 * The reels are voiceover-style (ElevenLabs over the footage) — NO lipsync — so we
 * never re-animate a mouth and never get the uncanny look. No-ops without a key.
 */
export const isRunwayConfigured = () => !!env.runwayApiSecret;

/** Vertical 9:16 — the social/reel format. */
export type VideoRatio = "720:1280";
export type ImageRatio = "720:1280";

let _client: RunwayML | null = null;
function client(): RunwayML {
  if (!_client) _client = new RunwayML({ apiKey: env.runwayApiSecret });
  return _client;
}

function firstOutput(task: { output?: string[] }): string | null {
  return task.output?.[0] ?? null;
}

/**
 * Compose a still of the agent placed into the listing scene. `@agent` and
 * `@scene` in the prompt reference the two images so Runway keeps the agent's
 * likeness while adopting the room. Returns the image URL (the clip's first frame).
 */
export async function composeAgentFrame(input: {
  agentImageUrl: string;
  sceneImageUrl: string;
  promptText: string;
  ratio?: ImageRatio;
}): Promise<string | null> {
  const task = await client()
    .textToImage.create({
      model: "gen4_image",
      ratio: input.ratio ?? "720:1280",
      promptText: input.promptText,
      referenceImages: [
        { uri: input.agentImageUrl, tag: "agent" },
        { uri: input.sceneImageUrl, tag: "scene" },
      ],
    })
    .waitForTaskOutput();
  return firstOutput(task);
}

/**
 * Animate a first-frame image into a short cinematic clip (2–10s). Silent — the
 * voiceover is muxed later. Returns the clip URL.
 */
export async function animateClip(input: {
  firstFrameUrl: string;
  promptText: string;
  durationSec: number;
  ratio?: VideoRatio;
}): Promise<string | null> {
  const duration = Math.min(10, Math.max(2, Math.round(input.durationSec)));
  const task = await client()
    .imageToVideo.create({
      model: "gen4.5",
      ratio: input.ratio ?? "720:1280",
      duration,
      promptImage: [{ position: "first", uri: input.firstFrameUrl }],
      promptText: input.promptText,
    })
    .waitForTaskOutput();
  return firstOutput(task);
}

/**
 * One call: compose the agent into the scene, then animate it into a clip.
 * `motionPrompt` describes the camera/agent motion (walk-through, push-in, etc.).
 */
export async function generateAgentSceneClip(input: {
  agentImageUrl: string;
  sceneImageUrl: string;
  framePrompt: string;
  motionPrompt: string;
  durationSec: number;
}): Promise<string | null> {
  const frame = await composeAgentFrame({
    agentImageUrl: input.agentImageUrl,
    sceneImageUrl: input.sceneImageUrl,
    promptText: input.framePrompt,
  });
  if (!frame) return null;
  return animateClip({
    firstFrameUrl: frame,
    promptText: input.motionPrompt,
    durationSec: input.durationSec,
  });
}

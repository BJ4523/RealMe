import "server-only";
import { ElevenLabsClient } from "@elevenlabs/elevenlabs-js";
import { env } from "@/lib/env";

/**
 * ElevenLabs — expressive cloned-voice narration. This replaces HeyGen's monotone
 * starfish TTS: `eleven_v3` actually *acts* (emotion, emphasis, energy), which is
 * what the reels were missing. The agent's voice is an Instant Voice Clone (IVC),
 * recommended over PVC for v3. All calls no-op-safely when the key is unset.
 */
export const isElevenConfigured = () => !!env.elevenLabsApiKey;

let _client: ElevenLabsClient | null = null;
function client(): ElevenLabsClient {
  if (!_client) _client = new ElevenLabsClient({ apiKey: env.elevenLabsApiKey });
  return _client;
}

// The expressive model. `eleven_v3` is the most lifelike; `eleven_turbo_v2_5` is
// the fast/cheap fallback if a project needs lower latency/cost.
const MODEL = "eleven_v3";

export interface SpeechResult {
  audio: Buffer;
  /** mp3 by default. */
  contentType: string;
}

/**
 * Synthesize narration in the cloned voice. `energy` (0–1) maps to the v3 "style"
 * exaggeration — crank it for Gen-Z/hype, lower for the polished classic voice.
 * Stability is kept on the "creative" side so delivery isn't flat.
 */
export async function speak(
  text: string,
  voiceId: string,
  opts: { energy?: number; speed?: number } = {},
): Promise<SpeechResult> {
  const style = Math.min(1, Math.max(0, opts.energy ?? 0.5));
  const res = await client().textToSpeech.convert(voiceId, {
    text,
    modelId: MODEL,
    outputFormat: "mp3_44100_128",
    voiceSettings: {
      // Lower stability = more emotional/expressive (v3's key knob).
      stability: 0.4,
      similarityBoost: 0.8,
      style,
      useSpeakerBoost: true,
      speed: opts.speed ?? 1,
    },
  });
  const reader = res.getReader();
  const chunks: Uint8Array[] = [];
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) chunks.push(value);
  }
  return { audio: Buffer.concat(chunks), contentType: "audio/mpeg" };
}

/**
 * Instant Voice Clone the agent's voice from a sample audio URL. Returns the new
 * ElevenLabs voice_id to store on the avatar. Null on failure so onboarding can
 * fall back. (Onboarding "voice upload" path.)
 */
export async function cloneVoice(name: string, sampleUrl: string): Promise<string> {
  const sample = await fetch(sampleUrl);
  if (!sample.ok) throw new Error(`Couldn't fetch the voice sample (${sample.status}).`);
  const buf = Buffer.from(await sample.arrayBuffer());
  const ct = sample.headers.get("content-type") || "audio/webm";
  const ext = /mp4|m4a/.test(ct) ? "m4a" : /mpeg|mp3/.test(ct) ? "mp3" : /wav/.test(ct) ? "wav" : "webm";
  // A named File gives the multipart upload a proper filename/type.
  const file = new File([buf], `voice-sample.${ext}`, { type: ct });
  try {
    const created = await client().voices.ivc.create({
      name,
      files: [file],
      removeBackgroundNoise: true,
    });
    if (!created.voiceId) throw new Error("no voice id returned");
    return created.voiceId;
  } catch (e) {
    // Surface ElevenLabs' real message (e.g. missing permission / plan).
    const msg =
      (e as { body?: { detail?: { message?: string } } })?.body?.detail?.message ??
      (e as Error)?.message ??
      "voice clone failed";
    throw new Error(`ElevenLabs: ${msg}`);
  }
}

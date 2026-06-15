import "server-only";
import { ENDPOINTS, heygenFetch, isMock } from "./client";

export interface SpeechResult {
  audioUrl: string;
  /** Narration length in seconds. */
  duration: number;
}

// Street-suffix + unit abbreviations the TTS would otherwise mispronounce —
// e.g. "Dakota Dr" → "Dakota Doctor", "Oak St" → "Oak Saint". Expanded to the
// full word so addresses read naturally. Matched as standalone tokens (optional
// trailing period), case-insensitive, preserving the rest of the text.
const SPEECH_EXPANSIONS: [RegExp, string][] = [
  [/\bDr\.?\b/g, "Drive"],
  [/\bSt\.?\b/g, "Street"],
  [/\bAve\.?\b/g, "Avenue"],
  [/\bBlvd\.?\b/g, "Boulevard"],
  [/\bRd\.?\b/g, "Road"],
  [/\bLn\.?\b/g, "Lane"],
  [/\bCt\.?\b/g, "Court"],
  [/\bPl\.?\b/g, "Place"],
  [/\bCir\.?\b/g, "Circle"],
  [/\bTer\.?\b/g, "Terrace"],
  [/\bPkwy\.?\b/g, "Parkway"],
  [/\bHwy\.?\b/g, "Highway"],
  [/\bSq\.?\b/g, "Square"],
  [/\bApt\.?\b/g, "Apartment"],
  [/\bSte\.?\b/g, "Suite"],
  [/\bMt\.?\b/g, "Mount"],
];

/** Normalize text for natural speech (expand street/unit abbreviations). */
export function normalizeSpeechText(text: string): string {
  let out = text;
  for (const [re, full] of SPEECH_EXPANSIONS) out = out.replace(re, full);
  return out;
}

/**
 * Generate narration audio in a given (cloned) voice via HeyGen's standalone
 * TTS. Used for cinematic walkthroughs, where the Seedance clips are silent and
 * the agent's voice is muxed over the stitched footage. Verified live:
 * POST /v1/audio/text_to_speech { voice_id, text } -> { audio_url, duration }.
 */
export async function generateSpeech(
  text: string,
  voiceId: string,
): Promise<SpeechResult> {
  if (isMock) {
    return { audioUrl: "https://example.com/mock-narration.wav", duration: 30 };
  }
  const res = await heygenFetch<{
    data: { audio_url: string; duration: number };
  }>(ENDPOINTS.textToSpeech, {
    method: "POST",
    json: { voice_id: voiceId, text: normalizeSpeechText(text) },
  });
  return { audioUrl: res.data.audio_url, duration: res.data.duration };
}

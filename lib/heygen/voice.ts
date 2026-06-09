import "server-only";
import { ENDPOINTS, heygenFetch, isMock } from "./client";

export interface SpeechResult {
  audioUrl: string;
  /** Narration length in seconds. */
  duration: number;
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
    json: { voice_id: voiceId, text },
  });
  return { audioUrl: res.data.audio_url, duration: res.data.duration };
}

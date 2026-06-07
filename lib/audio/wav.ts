/**
 * Browser audio → WAV helpers for the in-app voice recorder.
 *
 * `MediaRecorder` emits browser-specific containers (Chrome: webm/opus,
 * Safari: mp4/aac) that HeyGen's instant voice clone often rejects. We decode
 * whatever was captured and re-encode it as 16-bit PCM mono WAV — the format
 * HeyGen accepts most reliably. A ~30s clip is a few MB, well under the 32MB cap.
 */

/**
 * Encode mono float samples (range [-1, 1]) as a 16-bit PCM WAV blob.
 * Pure — no browser audio APIs — so it can be unit-tested in isolation.
 */
export function encodeWavFromMono(
  samples: Float32Array,
  sampleRate: number,
): Blob {
  const numChannels = 1;
  const bytesPerSample = 2;
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = samples.length * bytesPerSample;

  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  writeString(view, 0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(view, 8, "WAVE");
  writeString(view, 12, "fmt ");
  view.setUint32(16, 16, true); // PCM fmt chunk size
  view.setUint16(20, 1, true); // audio format: PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 8 * bytesPerSample, true); // bits per sample
  writeString(view, 36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    offset += 2;
  }

  return new Blob([buffer], { type: "audio/wav" });
}

/**
 * Decode a recorded audio blob, downmix to mono, and re-encode as a WAV File.
 * Browser-only (uses AudioContext). Returns a File ready to attach to a form.
 */
export async function blobToMonoWavFile(
  blob: Blob,
  fileName = "voice.wav",
): Promise<File> {
  const arrayBuffer = await blob.arrayBuffer();
  const AudioCtor =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: typeof AudioContext })
      .webkitAudioContext;
  if (!AudioCtor) throw new Error("Web Audio is not supported in this browser.");

  const ctx = new AudioCtor();
  try {
    const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
    const { length, numberOfChannels, sampleRate } = audioBuffer;

    const mono = new Float32Array(length);
    for (let c = 0; c < numberOfChannels; c++) {
      const channel = audioBuffer.getChannelData(c);
      for (let i = 0; i < length; i++) mono[i] += channel[i] / numberOfChannels;
    }

    const wav = encodeWavFromMono(mono, sampleRate);
    return new File([wav], fileName, { type: "audio/wav" });
  } finally {
    void ctx.close();
  }
}

function writeString(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) {
    view.setUint8(offset + i, value.charCodeAt(i));
  }
}

// Client-side video compression via ffmpeg.wasm (single-threaded core — needs
// NO cross-origin-isolation headers). Used by the avatar uploader so a large
// phone clip is transcoded to a small HeyGen-friendly MP4 (H.264 + AAC, faststart)
// in the browser, since the Storage bucket caps at 50MiB and raw phone video
// routinely exceeds that. The wasm core (~32MB) is self-hosted under
// /public/ffmpeg and lazy-loaded only when a clip actually needs compressing.

import type { FFmpeg } from "@ffmpeg/ffmpeg";

let ffmpegPromise: Promise<FFmpeg> | null = null;

/** Lazy-load and initialise a single shared ffmpeg.wasm instance. */
async function getFFmpeg(): Promise<FFmpeg> {
  if (!ffmpegPromise) {
    ffmpegPromise = (async () => {
      const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
        import("@ffmpeg/ffmpeg"),
        import("@ffmpeg/util"),
      ]);
      const ff = new FFmpeg();
      // Same-origin core; toBlobURL sidesteps the worker's cross-origin rules.
      await ff.load({
        coreURL: await toBlobURL("/ffmpeg/ffmpeg-core.js", "text/javascript"),
        wasmURL: await toBlobURL("/ffmpeg/ffmpeg-core.wasm", "application/wasm"),
      });
      return ff;
    })();
  }
  return ffmpegPromise;
}

export interface CompressOptions {
  /** Source clip duration (s) — used to size the bitrate to the byte budget. */
  durationSec: number;
  /** Target output size in bytes (keep under the Storage bucket cap). */
  targetBytes: number;
  /** 0..1 transcode progress. */
  onProgress?: (fraction: number) => void;
}

/**
 * Transcode `input` to an MP4 sized to fit under `targetBytes`: capped at 720p
 * (longest side ≤ 1280, never upscaled) with a bitrate derived from duration,
 * H.264 video + 128k AAC audio (audio preserved for voice cloning). Returns a
 * new File; throws if ffmpeg fails so the caller can fall back / surface it.
 */
export async function compressVideo(
  input: File,
  opts: CompressOptions,
): Promise<File> {
  const ff = await getFFmpeg();
  const { fetchFile } = await import("@ffmpeg/util");

  const onProgress = opts.onProgress;
  const handler = ({ progress }: { progress: number }) =>
    onProgress?.(Math.min(1, Math.max(0, progress)));
  ff.on("progress", handler);

  const inName = "in";
  const outName = "out.mp4";
  try {
    await ff.writeFile(inName, await fetchFile(input));

    // Derive a video bitrate that lands the whole file under the byte budget,
    // clamped to a sane range so short clips stay sharp and long ones stay small.
    const audioKbps = 128;
    const budgetKbits = (opts.targetBytes * 8) / 1000;
    const dur = Math.max(1, opts.durationSec);
    const videoKbps = Math.min(
      Math.max(Math.floor(budgetKbits / dur - audioKbps), 400),
      6000,
    );

    await ff.exec([
      "-i",
      inName,
      // Longest side ≤ 1280, preserve aspect, force even dimensions, no upscale.
      // Commas inside the expressions are escaped for ffmpeg's filtergraph parser.
      "-vf",
      "scale=if(gte(iw\\,ih)\\,min(1280\\,iw)\\,-2):if(gte(iw\\,ih)\\,-2\\,min(1280\\,ih))",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-b:v",
      `${videoKbps}k`,
      "-maxrate",
      `${Math.round(videoKbps * 1.45)}k`,
      "-bufsize",
      `${videoKbps * 2}k`,
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      `${audioKbps}k`,
      "-movflags",
      "+faststart",
      outName,
    ]);

    const data = (await ff.readFile(outName)) as Uint8Array;
    // Copy into a fresh ArrayBuffer-backed view so it's a valid BlobPart.
    const bytes = new Uint8Array(data);
    const base = input.name.replace(/\.[^.]+$/, "") || "twin";
    return new File([bytes], `${base}.mp4`, { type: "video/mp4" });
  } finally {
    ff.off("progress", handler);
    // Best-effort cleanup of the in-memory FS so repeated runs don't accumulate.
    await ff.deleteFile(inName).catch(() => {});
    await ff.deleteFile(outName).catch(() => {});
  }
}

import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/**
 * Concatenate cinematic clips into one vertical walkthrough and mux the
 * cloned-voice narration over the top (the clips are silent/voice-over). Runs a
 * bundled static ffmpeg in a Node serverless function. Normalizes each clip to
 * 720x1280/30fps, then concats and re-encodes at CRF 18 (`-preset medium`) so
 * quality matches the HeyGen source clips. `-shortest` trims to narration
 * length.
 *
 * NOTE: server-side ffmpeg in the Vercel runtime is the one piece that can only
 * be confirmed by a real run; on macOS the bundled binary is exercised by
 * scripts/stitch-smoke.mjs.
 */
export async function stitchClipsWithNarration(
  clips: Buffer[],
  narration: Buffer,
): Promise<Buffer> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  if (clips.length === 0) throw new Error("no clips to stitch");

  const dir = await mkdtemp(join(tmpdir(), "cine-"));
  try {
    const inputs: string[] = [];
    for (let i = 0; i < clips.length; i++) {
      const p = join(dir, `c${i}.mp4`);
      await writeFile(p, clips[i]);
      inputs.push("-i", p);
    }
    const narrPath = join(dir, "narr.wav");
    await writeFile(narrPath, narration);
    inputs.push("-i", narrPath);

    const n = clips.length;
    // Normalize every clip to a common 720x1280 / 30fps / square-pixel space so
    // the concat filter never errors on mismatched dimensions or SAR, then
    // concat. force_original_aspect_ratio=decrease + pad preserves the image
    // (letterboxes rather than stretching) without an upscale blur.
    const norm = clips
      .map(
        (_, i) =>
          `[${i}:v:0]scale=720:1280:force_original_aspect_ratio=decrease,` +
          `pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`,
      )
      .join(";");
    const concat =
      clips.map((_, i) => `[v${i}]`).join("") + `concat=n=${n}:v=1:a=0[v]`;
    const filter = `${norm};${concat}`;
    const outPath = join(dir, "out.mp4");

    const args = [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[v]",
      "-map",
      `${n}:a:0`,
      "-c:v",
      "libx264",
      "-preset",
      "medium",
      "-crf",
      "18",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      "-shortest",
      "-movflags",
      "+faststart",
      outPath,
    ];

    await new Promise<void>((resolve, reject) => {
      execFile(
        ffmpegPath as string,
        args,
        { maxBuffer: 1 << 27 },
        (err) => (err ? reject(err) : resolve()),
      );
    });

    return await readFile(outPath);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

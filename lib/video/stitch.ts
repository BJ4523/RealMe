import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

/**
 * Concatenate cinematic clips into one vertical walkthrough and mux the
 * cloned-voice narration over the top (the clips are silent/voice-over). Runs a
 * bundled static ffmpeg in a Node serverless function. `-shortest` trims the
 * video to the narration length. Uses the concat *filter* (re-encode) so it's
 * robust to minor differences between clips.
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
    const concat =
      clips.map((_, i) => `[${i}:v:0]`).join("") + `concat=n=${n}:v=1:a=0[v]`;
    const outPath = join(dir, "out.mp4");

    const args = [
      "-y",
      ...inputs,
      "-filter_complex",
      concat,
      "-map",
      "[v]",
      "-map",
      `${n}:a:0`,
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-c:a",
      "aac",
      "-b:a",
      "128k",
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

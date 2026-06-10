// Smoke test for the cinematic stitch step: generates two 9:16 test clips and a
// narration wav with the bundled ffmpeg, then concatenates + muxes exactly like
// lib/video/stitch.ts. Proves the ffmpeg-static binary + filter graph work.
//   node scripts/stitch-smoke.mjs
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "cine-smoke-"));
try {
  const c0 = join(dir, "c0.mp4");
  const c1 = join(dir, "c1.mp4");
  const narr = join(dir, "narr.wav");
  const out = join(dir, "out.mp4");

  // Two 3s vertical clips + a 5s narration tone.
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc=size=720x1280:rate=24:duration=3", "-pix_fmt", "yuv420p", c0]);
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "smptebars=size=720x1280:rate=24:duration=3", "-pix_fmt", "yuv420p", c1]);
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=5", narr]);

  const args = [
    "-y", "-i", c0, "-i", c1, "-i", narr,
    "-filter_complex",
    "[0:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v0];" +
    "[1:v:0]scale=720:1280:force_original_aspect_ratio=decrease,pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v1];" +
    "[v0][v1]concat=n=2:v=1:a=0[v]",
    "-map", "[v]", "-map", "2:a:0",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
  ];
  await run(ffmpegPath, args, { maxBuffer: 1 << 27 });

  const { size } = await stat(out);
  console.log(`✓ stitched output: ${(size / 1024).toFixed(1)} KB at ${out}`);
  if (size < 1000) throw new Error("output suspiciously small");
  console.log("✓ ffmpeg-static concat + audio mux works");
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

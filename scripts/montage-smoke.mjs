// End-to-end smoke for the montage assembler: 1 photo scene + 1 video scene,
// concatenated with a narration track and overlays. Exercises every ffmpeg path.
import { mkdtemp, writeFile, stat, rm, readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { assembleMontage } from "../lib/video/scenes.ts";

const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "montage-smoke-"));
try {
  const img = join(dir, "p.png");
  const vid = join(dir, "v.mp4");
  const narr = join(dir, "n.wav");
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc=size=1600x1000:duration=1:rate=1", "-frames:v", "1", img]);
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "smptebars=size=720x1280:rate=30:duration=3", "-pix_fmt", "yuv420p", vid]);
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=6", narr]);

  const out = await assembleMontage({
    scenes: [
      { kind: "photo", imageBuf: await readFile(img), motion: "zoom-in", durationMs: 3000 },
      { kind: "video", videoBuf: await readFile(vid), durationMs: 3000 },
    ],
    audio: { narration: await readFile(narr) },
    overlays: [{ text: "$999,000", startMs: 200, endMs: 2500, lane: "price" }],
  });
  const p = join(dir, "out.mp4");
  await writeFile(p, out);
  const { size } = await stat(p);
  if (size < 5000) throw new Error("montage output suspiciously small");
  console.log(`✓ montage assembled: ${(size / 1024).toFixed(1)} KB`);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

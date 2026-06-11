// Proves the bundled ffmpeg supports drawtext with our bundled font. GO/NO-GO for
// kinetic text overlays. If this fails, overlays degrade (Task 7 guards on it).
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { buildOverlayFilter } from "../lib/video/overlay.ts";

const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "ov-smoke-"));
const font = resolve("assets/fonts/HypeReel.ttf");
try {
  const out = join(dir, "out.mp4");
  const overlayFilter = buildOverlayFilter("[0:v]", "[v]", [
    { text: "$1,250,000", startMs: 200, endMs: 1800, lane: "price" },
    { text: "3 BD   2 BA   1,840 SQFT", startMs: 600, endMs: 2200, lane: "stats" },
  ], font);
  await run(ffmpegPath, [
    "-y", "-f", "lavfi", "-i", "color=c=gray:size=720x1280:rate=30:duration=3",
    "-filter_complex", overlayFilter,
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "20",
    "-pix_fmt", "yuv420p", out,
  ], { maxBuffer: 1 << 27 });
  const { size } = await stat(out);
  if (size < 1000) throw new Error("output suspiciously small");
  console.log(`✓ drawtext overlays render: ${(size / 1024).toFixed(1)} KB`);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

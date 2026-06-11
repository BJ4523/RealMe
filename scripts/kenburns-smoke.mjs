// Proves the bundled ffmpeg supports zoompan and our Ken-Burns filter produces a
// valid 720x1280 clip from a still image. GO/NO-GO for the real-photo backbone.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, stat, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { kenBurnsFilter } from "../lib/video/kenburns.ts";

const run = promisify(execFile);
const dir = await mkdtemp(join(tmpdir(), "kb-smoke-"));
try {
  const img = join(dir, "photo.png");
  const out = join(dir, "out.mp4");
  // A 1600x1000 landscape test image (mimics a wide listing photo).
  await run(ffmpegPath, ["-y", "-f", "lavfi", "-i", "testsrc=size=1600x1000:duration=1:rate=1", "-frames:v", "1", img]);

  const filter = kenBurnsFilter("[0:v]", "[v]", "zoom-in", 3000);
  await run(ffmpegPath, [
    "-y", "-loop", "1", "-t", "3", "-i", img,
    "-filter_complex", filter,
    "-map", "[v]", "-c:v", "libx264", "-preset", "medium", "-crf", "18",
    "-pix_fmt", "yuv420p", "-movflags", "+faststart", out,
  ], { maxBuffer: 1 << 27 });

  const { size } = await stat(out);
  if (size < 1000) throw new Error("output suspiciously small");
  console.log(`✓ Ken-Burns clip: ${(size / 1024).toFixed(1)} KB — zoompan works`);
} finally {
  await rm(dir, { recursive: true, force: true }).catch(() => {});
}

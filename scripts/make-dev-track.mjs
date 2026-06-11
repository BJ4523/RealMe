// Generates a placeholder, license-free 120bpm bed at public/music/default.mp3 so
// Hype Reel runs in dev without shipping copyrighted audio. Replace for prod.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir } from "node:fs/promises";
import ffmpegPath from "ffmpeg-static";

const run = promisify(execFile);
await mkdir("public/music", { recursive: true });
// A simple sine bed; 30s. (Not musical — just a valid, beat-stable audio file.)
await run(ffmpegPath, [
  "-y", "-f", "lavfi", "-i", "sine=frequency=220:duration=30",
  "-b:a", "128k", "public/music/default.mp3",
]);
console.log("✓ wrote public/music/default.mp3 (dev placeholder)");

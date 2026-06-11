// Pure-math check for lib/video/music/beats.ts (no ffmpeg, no network).
import { beatMs, roomDurationsMs, beatTimesMs } from "../lib/video/music/beats.ts";
import assert from "node:assert";

assert.strictEqual(beatMs(120), 500, "120bpm => 500ms/beat");
assert.deepStrictEqual(
  roomDurationsMs(120, 4, 3),
  [2000, 2000, 2000],
  "3 shots × 4 beats @120bpm => 2000ms each",
);
const grid = beatTimesMs(120, 250, 1300);
assert.deepStrictEqual(grid, [250, 750, 1250], "offset 250 + 500 step, < 1300");
console.log("✓ beats.ts math correct");

# Hype Reel + Faithful-Tour Retrofit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every video mode faithful to the real listing (real photos as the backbone, AI Seedance clips only as accents) and add a new "Hype Reel" mode — the digital twin hosts on-camera bookends around a beat-synced, music-backed tour with kinetic text overlays.

**Architecture:** Introduce one shared primitive — a **scene-based montage assembler** (`lib/video/scenes.ts`) that renders an ordered list of scenes (Ken-Burns motion over real photos, trimmed Seedance accent clips, or v2 host clips) to normalized 720×1280/30fps segments, then concats them with optional text overlays and an audio track (narration *or* a ducked music bed). Both the retrofitted Cinematic assembler and the new Hype Reel assembler are thin wrappers over it. Job orchestration (job-id-in-`heygen_video_id`, poll + cron, self-lock) is reused unchanged from the existing cinematic pipeline.

**Tech Stack:** Next.js 16 (App Router, TS) · Supabase · HeyGen (v2 presenter, v3 cinematic, TTS) · `ffmpeg-static` (bundled) · Anthropic (script) · Tailwind/shadcn.

**Spec:** `docs/superpowers/specs/2026-06-10-hype-reel-video-mode-design.md`

**Testing approach (per CLAUDE.md — no unit-test runner, do not scaffold one):** Pure helpers are verified by side-effect-free `node scripts/*.mjs` checks (the existing `scripts/stitch-smoke.mjs` pattern). ffmpeg behavior is verified by smoke scripts that run the real bundled binary and assert on output. Flows are verified with `HEYGEN_MOCK=1` end-to-end and `npm run build` (typecheck). Commit after each task.

---

## File Structure

**New files:**
- `lib/video/kenburns.ts` — pure: Ken-Burns ffmpeg filter snippets + motion presets.
- `lib/video/music/beats.ts` — pure: BPM → beat times / per-shot durations.
- `lib/video/overlay.ts` — pure: listing data → `drawtext` overlay filter chain.
- `lib/video/music/tracks.ts` — static royalty-free track library + lookup.
- `lib/video/scenes.ts` — the shared montage assembler (ffmpeg, server-only).
- `lib/video/hypereel.ts` — Hype Reel job encode/decode + `assembleHypeReel`.
- `scripts/kenburns-smoke.mjs` — proves zoompan works in bundled ffmpeg.
- `scripts/overlay-smoke.mjs` — proves drawtext works in bundled ffmpeg.
- `scripts/montage-smoke.mjs` — proves the full scene→segment→concat path.
- `scripts/make-dev-track.mjs` — generates a placeholder `public/music/default.mp3` for dev.
- `assets/fonts/HypeReel.ttf` — bundled font for drawtext (implementer supplies a licensed TTF).

**Modified files:**
- `lib/video/cinematic.ts` — retrofit `assembleCinematicVideo` onto `scenes.ts` (real photos + accents + narration). Keep `isCinematic`/`encodeCinematicJobs`.
- `app/(app)/videos/actions.ts` — rework `submitCinematicVideo`; add `submitHypeReelVideo`; pass photos through `pollVideoStatus`.
- `app/api/cron/reconcile-videos/route.ts` — route `reel:%` rows to `assembleHypeReel`; pass photos to both assemblers.
- `lib/ai/script.ts` — add `generateHypeReelScript` returning `{ intro, outro, featureCallouts }`.
- `components/videos/video-detail.tsx` — add "Generate hype reel" button + track picker; relax cinematic disclosure copy.
- `app/(app)/videos/[id]/page.tsx` — pass the track list to `VideoDetail`.
- `next.config.ts` — trace `assets/fonts/**` and `public/music/**` into the function bundle.

---

## Phase 0 — Preconditions

### Task 0: Confirm bundled ffmpeg + add the font

**Files:**
- Create: `assets/fonts/HypeReel.ttf`
- Modify: `next.config.ts`

- [ ] **Step 1: Confirm the existing stitch smoke still passes (baseline ffmpeg works)**

Run: `node scripts/stitch-smoke.mjs`
Expected: `✓ ffmpeg-static concat + audio mux works`

- [ ] **Step 2: Add a bundled TTF for drawtext**

drawtext on Vercel has no system fonts, so a font must be bundled and referenced by absolute path. Place a licensed/again-distributable `.ttf` (e.g. the project's display font, or Inter Bold) at `assets/fonts/HypeReel.ttf`. (Any valid TTF unblocks development; swap the final brand font later.)

Verify it exists and is a real font:

Run: `node -e "const s=require('fs').statSync('assets/fonts/HypeReel.ttf'); console.log('ttf bytes', s.size)"`
Expected: a non-trivial byte count (> 10000).

- [ ] **Step 3: Trace the font + music into the serverless bundle**

Open `next.config.ts`. It already traces `ffmpeg-static` (search for `outputFileTracingIncludes`). Add the font and music directories to the SAME config object so they ship with the functions that run ffmpeg (`/api/cron/reconcile-videos` and the video actions). Merge — do not duplicate the key:

```ts
// inside the existing nextConfig object
outputFileTracingIncludes: {
  // ...keep existing entries (e.g. ffmpeg-static)...
  "/api/cron/reconcile-videos": ["./assets/fonts/**", "./public/music/**"],
  "/app/(app)/videos/**": ["./assets/fonts/**", "./public/music/**"],
},
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add assets/fonts/HypeReel.ttf next.config.ts
git commit -m "chore: bundle drawtext font + trace fonts/music into functions"
```

---

## Phase 1 — Pure helpers + ffmpeg-capability smoke tests

### Task 1: Beat math (`lib/video/music/beats.ts`)

**Files:**
- Create: `lib/video/music/beats.ts`
- Test: `scripts/beats-check.mjs`

- [ ] **Step 1: Write the failing check**

Create `scripts/beats-check.mjs`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --experimental-strip-types scripts/beats-check.mjs`
Expected: FAIL — `Cannot find module '.../beats.ts'`.

- [ ] **Step 3: Implement `lib/video/music/beats.ts`**

```ts
/**
 * Pure beat math for music-synced video. No I/O — unit-checkable via
 * scripts/beats-check.mjs (kept side-effect-free per CLAUDE.md).
 */

/** Milliseconds per beat at a given tempo. */
export function beatMs(bpm: number): number {
  return 60000 / bpm;
}

/**
 * Uniform per-shot durations so each cut lands a whole number of beats apart.
 * `beatsPerShot` beats × `shotCount` shots. Rounded to whole ms.
 */
export function roomDurationsMs(
  bpm: number,
  beatsPerShot: number,
  shotCount: number,
): number[] {
  const d = Math.round(beatsPerShot * beatMs(bpm));
  return Array.from({ length: shotCount }, () => d);
}

/**
 * Absolute beat timestamps (ms) from `beatOffsetMs` up to (but not including)
 * `untilMs`. Used to schedule overlay fades on the beat.
 */
export function beatTimesMs(
  bpm: number,
  beatOffsetMs: number,
  untilMs: number,
): number[] {
  const step = beatMs(bpm);
  const out: number[] = [];
  for (let t = beatOffsetMs; t < untilMs; t += step) out.push(Math.round(t));
  return out;
}
```

- [ ] **Step 4: Run the check to verify it passes**

Run: `node --experimental-strip-types scripts/beats-check.mjs`
Expected: `✓ beats.ts math correct`

- [ ] **Step 5: Commit**

```bash
git add lib/video/music/beats.ts scripts/beats-check.mjs
git commit -m "feat: pure beat-math helpers for music-synced video"
```

---

### Task 2: Ken-Burns filter builder + ffmpeg smoke (`lib/video/kenburns.ts`)

**Files:**
- Create: `lib/video/kenburns.ts`
- Test: `scripts/kenburns-smoke.mjs`

- [ ] **Step 1: Implement the pure filter builder `lib/video/kenburns.ts`**

```ts
/**
 * Pure builders for a Ken-Burns (pan/zoom) move over a STILL listing photo, so a
 * faithful real photo gets cinematic motion. Returns an ffmpeg filter string for
 * a single image input label `[in]` -> output label `[out]`. No I/O.
 *
 * Recipe: oversample to a large 9:16 cover frame (so zoompan has pixels to move
 * into without upscale blur), then zoompan to 720x1280 @30fps. Pre-scaling avoids
 * the well-known zoompan jitter on small inputs.
 */
export type KenBurnsMotion =
  | "zoom-in"
  | "zoom-out"
  | "pan-left"
  | "pan-right"
  | "push-up";

const W = 720;
const H = 1280;
const FPS = 30;
const OVERSAMPLE = "1440:2560"; // 2× the target, 9:16

/** Rotate motions so consecutive photo scenes don't repeat. */
export function motionForIndex(i: number): KenBurnsMotion {
  const order: KenBurnsMotion[] = [
    "zoom-in",
    "pan-right",
    "zoom-out",
    "pan-left",
    "push-up",
  ];
  return order[i % order.length];
}

export function kenBurnsFilter(
  inLabel: string,
  outLabel: string,
  motion: KenBurnsMotion,
  durationMs: number,
): string {
  const frames = Math.max(1, Math.round((durationMs / 1000) * FPS));
  // zoom expression and pan expressions per motion. `on` is the output frame idx.
  const zMax = 1.25;
  const zoomIn = `min(zoom+${((zMax - 1) / frames).toFixed(6)},${zMax})`;
  const zoomOut = `if(eq(on,0),${zMax},max(zoom-${((zMax - 1) / frames).toFixed(6)},1))`;
  const cx = `iw/2-(iw/zoom/2)`;
  const cy = `ih/2-(ih/zoom/2)`;
  let z = "1.0001";
  let x = cx;
  let y = cy;
  switch (motion) {
    case "zoom-in":
      z = zoomIn;
      break;
    case "zoom-out":
      z = zoomOut;
      break;
    case "pan-left":
      z = `1.2`;
      x = `(iw-iw/zoom)*(1-on/${frames})`;
      break;
    case "pan-right":
      z = `1.2`;
      x = `(iw-iw/zoom)*(on/${frames})`;
      break;
    case "push-up":
      z = zoomIn;
      y = `(ih-ih/zoom)*(1-on/${frames})`;
      break;
  }
  return (
    `${inLabel}scale=${OVERSAMPLE}:force_original_aspect_ratio=increase,` +
    `crop=${OVERSAMPLE.replace(":", ":")},` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=${W}x${H}:fps=${FPS},` +
    `setsar=1${outLabel}`
  );
}
```

- [ ] **Step 2: Write the ffmpeg smoke `scripts/kenburns-smoke.mjs`**

```js
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
```

- [ ] **Step 3: Run the smoke (GO/NO-GO for zoompan)**

Run: `node --experimental-strip-types scripts/kenburns-smoke.mjs`
Expected: `✓ Ken-Burns clip: … KB — zoompan works`
If it fails with "No such filter: 'zoompan'", STOP and report — the bundled ffmpeg lacks zoompan and the backbone needs an alternative (animated `crop`); do not proceed silently.

- [ ] **Step 4: Commit**

```bash
git add lib/video/kenburns.ts scripts/kenburns-smoke.mjs
git commit -m "feat: Ken-Burns motion filter for real-photo scenes (+ ffmpeg smoke)"
```

---

### Task 3: Overlay builder + drawtext smoke (`lib/video/overlay.ts`)

**Files:**
- Create: `lib/video/overlay.ts`
- Test: `scripts/overlay-smoke.mjs`

- [ ] **Step 1: Implement the pure overlay builder `lib/video/overlay.ts`**

```ts
/**
 * Pure builder: listing facts + a beat grid -> an ffmpeg `drawtext` filter chain
 * that fades kinetic overlays in/out on the beat. No I/O. The font is bundled
 * (see assets/fonts/HypeReel.ttf); pass its absolute path as `fontFile`.
 */
export interface Overlay {
  text: string;
  startMs: number;
  endMs: number;
  /** Vertical lane: bottom third by default; price/address pinned. */
  lane: "price" | "stats" | "address" | "feature";
}

const LANE_Y: Record<Overlay["lane"], string> = {
  price: "h*0.10",
  address: "h*0.20",
  stats: "h*0.82",
  feature: "h*0.74",
};
const LANE_SIZE: Record<Overlay["lane"], number> = {
  price: 72,
  address: 34,
  stats: 40,
  feature: 44,
};

/** Escape text for ffmpeg drawtext (colons, quotes, backslashes, %). */
export function escapeDrawtext(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/'/g, "\\'")
    .replace(/%/g, "\\%");
}

/**
 * Build overlays from listing data. `featureCallouts` come from the script model;
 * the rest are structured facts. Each overlay shows for ~2 beats from its start.
 */
export function overlaysFromListing(input: {
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
  featureCallouts: string[];
  beatGrid: number[]; // absolute ms timestamps within the montage window
  showDurMs: number;
}): Overlay[] {
  const out: Overlay[] = [];
  const g = input.beatGrid;
  const at = (i: number) => g[Math.min(i, g.length - 1)] ?? 0;
  const span = (i: number): [number, number] => [at(i), at(i) + input.showDurMs];

  if (input.price) {
    const [s, e] = span(0);
    out.push({ text: input.price, startMs: s, endMs: e, lane: "price" });
  }
  if (input.address) {
    const [s, e] = span(0);
    out.push({ text: input.address, startMs: s, endMs: e, lane: "address" });
  }
  const stats = [
    input.beds ? `${input.beds} BD` : null,
    input.baths ? `${input.baths} BA` : null,
    input.sqft ? `${input.sqft.toLocaleString("en-US")} SQFT` : null,
  ]
    .filter(Boolean)
    .join("   ");
  if (stats) {
    const [s, e] = span(2);
    out.push({ text: stats, startMs: s, endMs: e, lane: "stats" });
  }
  input.featureCallouts.slice(0, 3).forEach((f, i) => {
    const [s, e] = span(4 + i * 2);
    out.push({ text: f, startMs: s, endMs: e, lane: "feature" });
  });
  return out;
}

/** Build the drawtext filter chain applied over a [in] video label -> [out]. */
export function buildOverlayFilter(
  inLabel: string,
  outLabel: string,
  overlays: Overlay[],
  fontFile: string,
): string {
  if (overlays.length === 0) return `${inLabel}null${outLabel}`;
  const font = fontFile.replace(/\\/g, "/").replace(/:/g, "\\:");
  const draws = overlays
    .map((o) => {
      const t0 = (o.startMs / 1000).toFixed(3);
      const t1 = (o.endMs / 1000).toFixed(3);
      // 0.3s fade in/out via alpha ramp; white text, semi-opaque dark box.
      const alpha =
        `if(lt(t,${t0}),0,` +
        `if(lt(t,${(o.startMs / 1000 + 0.3).toFixed(3)}),(t-${t0})/0.3,` +
        `if(lt(t,${(o.endMs / 1000 - 0.3).toFixed(3)}),1,` +
        `if(lt(t,${t1}),(${t1}-t)/0.3,0))))`;
      return (
        `drawtext=fontfile='${font}':text='${escapeDrawtext(o.text)}':` +
        `fontcolor=white:fontsize=${LANE_SIZE[o.lane]}:` +
        `x=(w-text_w)/2:y=${LANE_Y[o.lane]}:` +
        `box=1:boxcolor=black@0.45:boxborderw=18:` +
        `alpha='${alpha}':enable='between(t,${t0},${t1})'`
      );
    })
    .join(",");
  return `${inLabel}${draws}${outLabel}`;
}
```

- [ ] **Step 2: Write the drawtext smoke `scripts/overlay-smoke.mjs`**

```js
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
```

- [ ] **Step 3: Run the smoke (GO/NO-GO for drawtext)**

Run: `node --experimental-strip-types scripts/overlay-smoke.mjs`
Expected: `✓ drawtext overlays render: … KB`
If it fails with "No such filter: 'drawtext'" or a font error, note it — Task 7's assembler must treat overlays as optional (skip + log) so the feature still ships without text.

- [ ] **Step 4: Commit**

```bash
git add lib/video/overlay.ts scripts/overlay-smoke.mjs
git commit -m "feat: kinetic listing-data overlays via drawtext (+ ffmpeg smoke)"
```

---

## Phase 2 — The shared montage assembler

### Task 4: `lib/video/scenes.ts` + montage smoke

**Files:**
- Create: `lib/video/scenes.ts`
- Test: `scripts/montage-smoke.mjs`

- [ ] **Step 1: Implement `lib/video/scenes.ts`**

Two-stage ffmpeg: render each scene to a normalized 720×1280/30fps segment, then concat + overlay + mux audio. Photo scenes use `kenBurnsFilter`; video scenes (accent/host) are scaled/padded and trimmed to `durationMs`. Audio is either a single narration track (`-shortest`) or a music bed ducked under embedded segment audio via `sidechaincompress`.

```ts
import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { kenBurnsFilter, type KenBurnsMotion } from "./kenburns";
import { buildOverlayFilter, type Overlay } from "./overlay";

const W = 720, H = 1280, FPS = 30;
const FONT = resolve("assets/fonts/HypeReel.ttf");

export type MontageScene =
  | { kind: "photo"; imageBuf: Buffer; motion: KenBurnsMotion; durationMs: number }
  | { kind: "video"; videoBuf: Buffer; durationMs: number; keepAudio?: boolean };

export interface MontageAudio {
  /** Cinematic: one narration track muxed over the whole montage. */
  narration?: Buffer;
  /** Hype Reel: a music bed (full length). */
  music?: Buffer;
  /** Hype Reel: duck the music under scenes that kept their own audio (host VO). */
  duckUnderSceneAudio?: boolean;
}

function ff(args: string[]): Promise<void> {
  if (!ffmpegPath) throw new Error("ffmpeg binary unavailable");
  return new Promise((res, rej) =>
    execFile(ffmpegPath as string, args, { maxBuffer: 1 << 27 }, (e) =>
      e ? rej(e) : res(),
    ),
  );
}

/** Render one scene to a normalized segment file at `outPath`. */
async function renderScene(
  scene: MontageScene,
  inPath: string,
  outPath: string,
): Promise<void> {
  const durSec = (scene.durationMs / 1000).toFixed(3);
  if (scene.kind === "photo") {
    const filter = kenBurnsFilter("[0:v]", "[v]", scene.motion, scene.durationMs);
    await ff([
      "-y", "-loop", "1", "-t", durSec, "-i", inPath,
      "-filter_complex", filter, "-map", "[v]",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-r", String(FPS), outPath,
    ]);
    return;
  }
  // video scene: normalize to 720x1280/30fps, trim to duration. Every segment
  // carries a stereo audio track (real for host scenes, silent otherwise) so the
  // concat demuxer sees a uniform layout.
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`;
  if (scene.keepAudio) {
    // Keep the clip's own audio (e.g. host voice-over).
    await ff([
      "-y", "-i", inPath, "-t", durSec, "-vf", vf,
      "-map", "0:v:0", "-map", "0:a:0?",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100", outPath,
    ]);
    return;
  }
  // Silent: synthesize a stereo null track of the same duration.
  await ff([
    "-y", "-i", inPath,
    "-f", "lavfi", "-t", durSec, "-i", "anullsrc=r=44100:cl=stereo",
    "-t", durSec, "-vf", vf,
    "-map", "0:v:0", "-map", "1:a:0",
    "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
    "-c:a", "aac", "-b:a", "192k", outPath,
  ]);
}

/**
 * Render scenes -> segments -> concat (+ overlays, + audio). Returns the final
 * MP4 buffer. Overlays are best-effort: if drawtext is unavailable the caller may
 * pass [] and they are skipped.
 */
export async function assembleMontage(opts: {
  scenes: MontageScene[];
  audio: MontageAudio;
  overlays?: Overlay[];
}): Promise<Buffer> {
  if (opts.scenes.length === 0) throw new Error("no scenes to assemble");
  const dir = await mkdtemp(join(tmpdir(), "montage-"));
  try {
    // 1) Render each scene to seg{i}.mp4 (all 720x1280/30fps, stereo audio).
    const segPaths: string[] = [];
    for (let i = 0; i < opts.scenes.length; i++) {
      const s = opts.scenes[i];
      const inPath = join(dir, `in${i}`);
      await writeFile(inPath, s.kind === "photo" ? s.imageBuf : s.videoBuf);
      const seg = join(dir, `seg${i}.mp4`);
      await renderScene(s, inPath, seg);
      segPaths.push(seg);
    }

    // 2) Concat via the demuxer (uniform params guaranteed by step 1).
    const listPath = join(dir, "list.txt");
    await writeFile(listPath, segPaths.map((p) => `file '${p}'`).join("\n"));
    const concatV = join(dir, "concatV.mp4");
    await ff([
      "-y", "-f", "concat", "-safe", "0", "-i", listPath,
      "-c", "copy", concatV,
    ]);

    // 3) Final pass: overlays + audio.
    const out = join(dir, "out.mp4");
    const overlayFilter = buildOverlayFilter("[0:v]", "[vout]", opts.overlays ?? [], FONT);

    if (opts.audio.narration) {
      // Cinematic: single narration track, trim video to narration (-shortest).
      const narrPath = join(dir, "narr.wav");
      await writeFile(narrPath, opts.audio.narration);
      await ff([
        "-y", "-i", concatV, "-i", narrPath,
        "-filter_complex", overlayFilter,
        "-map", "[vout]", "-map", "1:a:0",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
      ]);
    } else if (opts.audio.music) {
      // Hype Reel: music bed, optionally ducked under the concat's own audio.
      const musicPath = join(dir, "music");
      await writeFile(musicPath, opts.audio.music);
      const audioGraph = opts.audio.duckUnderSceneAudio
        ? // sidechain: music keyed by the concat audio (host VO) -> duck, then mix VO back on top
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[mus];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo[vo];` +
          `[mus][vo]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked];` +
          `[ducked][vo]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        : `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.8[aout]`;
      await ff([
        "-y", "-i", concatV, "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", `${overlayFilter};${audioGraph}`,
        "-map", "[vout]", "-map", "[aout]",
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart", out,
      ]);
    } else {
      throw new Error("montage audio: provide narration or music");
    }

    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}
```

- [ ] **Step 2: Write `scripts/montage-smoke.mjs`**

```js
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
```

- [ ] **Step 3: Run the montage smoke**

Run: `node --experimental-strip-types scripts/montage-smoke.mjs`
Expected: `✓ montage assembled: … KB`
Iterate on `scenes.ts` until it passes (this is where ffmpeg mapping bugs surface).

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add lib/video/scenes.ts scripts/montage-smoke.mjs
git commit -m "feat: shared scene montage assembler (Ken-Burns + accents + audio)"
```

---

## Phase 3 — Retrofit Cinematic onto the montage (faithful)

### Task 5: Rework `assembleCinematicVideo` to use real photos + accents

**Files:**
- Modify: `lib/video/cinematic.ts`
- Modify: `app/(app)/videos/actions.ts` (`submitCinematicVideo`, `pollVideoStatus`)
- Modify: `app/api/cron/reconcile-videos/route.ts`

- [ ] **Step 1: Extend the assemble input with photos and rewrite the body**

In `lib/video/cinematic.ts`, replace the `AssemblableVideo` interface and the assembly body so the **real listing photos are the backbone** and the decoded job ids are **accent clips** interleaved. Keep `CINEMATIC_PREFIX`, `isCinematic`, `encodeCinematicJobs`, `decodeCinematicJobs`, `fetchBuffer` as-is.

Replace the interface (around line 36) and `assembleCinematicVideo` body:

```ts
import { motionForIndex } from "@/lib/video/kenburns";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";
// (remove the stitchClipsWithNarration import — no longer used here)

interface AssemblableVideo {
  id: string;
  user_id: string;
  script: string | null;
  heygen_video_id: string | null;
  /** Real listing photo URLs — the faithful backbone of the tour. */
  photos: string[];
}

/** How many real-photo scenes to show, and where accents slot in. */
const MAX_PHOTO_SCENES = 6;
const MIN_SCENE_MS = 2500;
```

Then, inside `assembleCinematicVideo`, after the existing status polling + claim block (keep lines that poll `getCinematicClipStatus`, fail on failure, return processing while incomplete, and claim the row), replace the narration+stitch+upload section (current lines ~94-129) with:

```ts
    // Narration in the agent's cloned voice over the whole tour.
    const narration = await generateSpeech(
      video.script?.trim() || "Welcome to this beautiful home.",
      voiceId ?? DEFAULT_VOICE_ID,
    );

    const accentBufs = await Promise.all(clipUrls.map(fetchBuffer));
    const photoUrls = video.photos.slice(0, MAX_PHOTO_SCENES);
    const photoBufs = await Promise.all(photoUrls.map(fetchBuffer));
    if (photoBufs.length === 0 && accentBufs.length === 0) {
      throw new Error("No photos or clips to assemble.");
    }

    // Build scenes: real photos as the backbone, accents interleaved (~1 per 3).
    const sceneCount = photoBufs.length + accentBufs.length;
    const perSceneMs = Math.max(
      MIN_SCENE_MS,
      Math.round(((narration.duration || 30) * 1000) / Math.max(1, sceneCount)),
    );
    const scenes: MontageScene[] = [];
    let ai = 0;
    photoBufs.forEach((buf, i) => {
      scenes.push({ kind: "photo", imageBuf: buf, motion: motionForIndex(i), durationMs: perSceneMs });
      if (ai < accentBufs.length && i % 3 === 2) {
        scenes.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: perSceneMs });
      }
    });
    while (ai < accentBufs.length) {
      scenes.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: perSceneMs });
    }

    const narrationBuf = await fetchBuffer(narration.audioUrl);
    const assembled = await assembleMontage({
      scenes,
      audio: { narration: narrationBuf },
    });

    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${video.user_id}/${video.id}.mp4`;
    const up = await storage.storage
      .from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);

    const { data: signed } = await storage.storage
      .from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    await supabase
      .from("videos")
      .update({
        status: "completed",
        video_url: signed?.signedUrl ?? null,
        duration: Math.round(narration.duration) || null,
      })
      .eq("id", video.id);
    return "completed";
```

Note: `jobIds.length === 0` no longer means failure (a tour can be all real photos with zero accents). Change the early guard (current lines 57-63) to only fail when there are also no photos:

```ts
  const jobIds = decodeCinematicJobs(video.heygen_video_id!);
  // Accents are optional now; a tour can be 100% real photos. Only the assemble
  // step (below) fails if there are neither photos nor accents.
```

And guard the status poll so an empty `jobIds` array short-circuits to "all complete":

```ts
    const statuses = jobIds.length
      ? await Promise.all(jobIds.map(getCinematicClipStatus))
      : [];
```

- [ ] **Step 2: Pass photos from `submitCinematicVideo` and reduce accents**

In `app/(app)/videos/actions.ts`, change `MAX_CINEMATIC_SHOTS` (line 23) to an accent cap and update `submitCinematicVideo` to generate **at most 1** accent (faithful-dominant), still encoding via `encodeCinematicJobs`:

```ts
/** Cinematic ACCENT clips (AI flair) per video. Real photos are the backbone. */
const MAX_CINEMATIC_ACCENTS = 1;
```

In `submitCinematicVideo`, replace the photo-slice + jobs block (lines 220-247) so it generates accents from the first photo(s) only:

```ts
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];
  if (photos.length === 0) {
    return fail("Add listing photos to generate a cinematic walkthrough.");
  }
  const accentPhotos = photos.slice(0, MAX_CINEMATIC_ACCENTS);

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    const jobs = await Promise.all(
      accentPhotos.map((url, i) =>
        generateCinematicClip({
          avatarLookId: avatar.heygen_avatar_id!,
          referenceUrl: url,
          prompt: cinematicPrompt(listing, i, accentPhotos.length),
          duration: 10,
        }),
      ),
    );
    await supabase
      .from("videos")
      .update({
        heygen_video_id: encodeCinematicJobs(jobs.map((j) => j.jobId)),
        status: "processing",
        thumbnail_url: photos[0] ?? null,
      })
      .eq("id", videoId)
      .eq("user_id", userId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Cinematic generation failed.");
    return;
  }
  revalidatePath(`/videos/${videoId}`);
```

- [ ] **Step 3: Pass photos into the assembler from `pollVideoStatus`**

In `pollVideoStatus` (line ~275), the cinematic branch must now also load the listing photos. Update the select to join the listing and pass photos:

```ts
  // (top of pollVideoStatus) widen the select to include listing photos:
  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(photos)")
    .eq("id", videoId)
    .single();
  if (!video) return null;
  const photos = (video.listings as { photos: unknown } | null)
    ? listingPhotos((video.listings as { photos: Json }).photos).map((p) => p.url)
    : [];
```

and in the `isCinematic(...)` branch pass `photos` to `assembleCinematicVideo`:

```ts
    await assembleCinematicVideo(
      supabase,
      {
        id: video.id,
        user_id: video.user_id,
        script: video.script,
        heygen_video_id: video.heygen_video_id,
        photos,
      },
      av?.voice_id ?? null,
    );
```

(`listingPhotos` and `Json` are already imported in this file.)

- [ ] **Step 4: Pass photos into the assembler from the cron**

In `app/api/cron/reconcile-videos/route.ts`, the cinematic loop (lines 77-110) must load each row's listing photos. Update the select to `"id, user_id, script, heygen_video_id, status, avatar_id, listing_id"`, then before calling `assembleCinematicVideo` fetch photos:

```ts
import { listingPhotos } from "@/lib/format";
// ...
    const { data: lst } = await supabase
      .from("listings")
      .select("photos")
      .eq("id", v.listing_id ?? "")
      .maybeSingle();
    const photos = lst ? listingPhotos(lst.photos).map((p) => p.url) : [];
    const result = await assembleCinematicVideo(
      supabase,
      { id: v.id, user_id: v.user_id, script: v.script, heygen_video_id: v.heygen_video_id, photos },
      av?.voice_id ?? null,
    );
```

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors. (If `stitchClipsWithNarration` is now unused, leave `lib/video/stitch.ts` in place — `scripts/stitch-smoke.mjs` still references the same ffmpeg path; do not delete.)

- [ ] **Step 6: Mock E2E — cinematic is now faithful**

Run (one terminal): `HEYGEN_MOCK=1 npm run dev`
Then: `BASE_URL=http://localhost:3000 node scripts/e2e.mjs`
Expected: the flow completes; a cinematic video reaches `completed`. Manually open the generated video for a listing with photos and confirm it shows the **real photos** (with motion) plus at most one AI accent.

- [ ] **Step 7: Commit**

```bash
git add lib/video/cinematic.ts "app/(app)/videos/actions.ts" app/api/cron/reconcile-videos/route.ts
git commit -m "feat: cinematic mode now real-photo backbone + <=1 AI accent (faithful)"
```

---

### Task 6: Relax the cinematic disclosure copy

**Files:**
- Modify: `components/videos/video-detail.tsx`

- [ ] **Step 1: Update the cinematic helper text**

Replace the `cinematicReady` disclosure paragraph (lines 229-234) — it no longer shows pure AI rooms:

```tsx
          {cinematicReady ? (
            <p className="text-right text-xs text-muted-foreground">
              Cinematic tours your real listing photos with motion and a few
              AI-generated accent shots for flair. Faithful to the property, with
              a cinematic finish.
            </p>
          ) : hasTwin ? (
```

Also update the "Generate cinematic" button `title` (line 187):

```tsx
                  title="Your real photos with motion + a few AI accent shots"
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add components/videos/video-detail.tsx
git commit -m "copy: cinematic disclosure reflects faithful real-photo tour"
```

---

## Phase 4 — Hype Reel mode

### Task 7: Track library + dev track generator

**Files:**
- Create: `lib/video/music/tracks.ts`
- Create: `scripts/make-dev-track.mjs`

- [ ] **Step 1: Implement `lib/video/music/tracks.ts`**

```ts
/**
 * Royalty-free music library for Hype Reel. Each track is pre-annotated with its
 * tempo + lead-in so beats.ts can sync cuts WITHOUT runtime beat detection.
 * Files live in public/music and are traced into the function (next.config.ts).
 *
 * IMPORTANT: ship only properly-licensed audio. `default.mp3` is generated for
 * dev by scripts/make-dev-track.mjs; replace it with a licensed track for prod.
 */
export interface MusicTrack {
  id: string;
  title: string;
  /** Public path (served from /public) and bundled file path. */
  file: string;
  bpm: number;
  beatOffsetMs: number;
  durationSec: number;
  mood: string;
}

export const TRACKS: MusicTrack[] = [
  {
    id: "default",
    title: "Uptempo (dev)",
    file: "public/music/default.mp3",
    bpm: 120,
    beatOffsetMs: 0,
    durationSec: 30,
    mood: "energetic",
  },
];

export function getTrack(id: string | null | undefined): MusicTrack {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}
```

- [ ] **Step 2: Implement `scripts/make-dev-track.mjs`**

```js
// Generates a placeholder, license-free 120bpm click-bed at public/music/default.mp3
// so Hype Reel runs in dev without shipping copyrighted audio. Replace for prod.
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
```

- [ ] **Step 3: Generate the dev track**

Run: `node scripts/make-dev-track.mjs`
Expected: `✓ wrote public/music/default.mp3 (dev placeholder)`

- [ ] **Step 4: Commit (code only — the mp3 is gitignored under public if applicable; commit if not)**

```bash
git add lib/video/music/tracks.ts scripts/make-dev-track.mjs
git commit -m "feat: music track library + dev placeholder track generator"
```

---

### Task 8: Hype Reel script variant

**Files:**
- Modify: `lib/ai/script.ts`

- [ ] **Step 1: Add `generateHypeReelScript`**

Append to `lib/ai/script.ts` (reuse `listingForPrompt`, `env`, `Anthropic`, `zodOutputFormat`, `z` already imported):

```ts
const HypeReelSchema = z.object({
  intro: z.string().describe("Punchy ~5s on-camera host opener. One or two sentences."),
  outro: z.string().describe("~4s closing call-to-action, on camera."),
  featureCallouts: z
    .array(z.string())
    .describe("2-3 SHORT on-screen text callouts (e.g. 'Chef's kitchen'). Max ~24 chars each."),
});

export type HypeReelScript = z.infer<typeof HypeReelSchema>;

export async function generateHypeReelScript(
  listing: Listing,
): Promise<HypeReelScript> {
  if (!env.anthropicApiKey) return templatedHypeReel(listing);
  const client = new Anthropic({ apiKey: env.anthropicApiKey });
  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 800,
      system:
        "You are a real-estate agent hosting a fast, high-energy social hype reel of your listing. " +
        "Use ONLY the facts provided — never invent rooms, finishes, or numbers. " +
        "Write a punchy on-camera intro (~5s) and a closing CTA (~4s), plus 2-3 very short on-screen callouts.",
      messages: [{ role: "user", content: JSON.stringify(listingForPrompt(listing)) }],
      output_config: { format: zodOutputFormat(HypeReelSchema) },
    });
    return message.parsed_output ?? templatedHypeReel(listing);
  } catch {
    return templatedHypeReel(listing);
  }
}

function templatedHypeReel(listing: Listing): HypeReelScript {
  const place = [listing.address, listing.city].filter(Boolean).join(", ");
  const intro = `Welcome to ${place || "your next home"} — let's take a look.`;
  const outro = "Want to see it in person? Reach out today.";
  const callouts = (listing.features ?? []).slice(0, 3).map((f) => String(f).slice(0, 24));
  return { intro, outro, featureCallouts: callouts };
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/ai/script.ts
git commit -m "feat: Hype Reel script variant (intro/outro/callouts) + templated fallback"
```

---

### Task 9: `lib/video/hypereel.ts` — encode + assemble

**Files:**
- Create: `lib/video/hypereel.ts`

- [ ] **Step 1: Implement job encoding + assembly**

```ts
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createAdminClient, adminConfigured } from "@/lib/supabase/admin";
import { getCinematicClipStatus } from "@/lib/heygen/cinematic";
import { getVideoStatus } from "@/lib/heygen/video";
import { assembleMontage, type MontageScene } from "@/lib/video/scenes";
import { motionForIndex } from "@/lib/video/kenburns";
import { roomDurationsMs, beatTimesMs } from "@/lib/video/music/beats";
import { overlaysFromListing } from "@/lib/video/overlay";
import { getTrack } from "@/lib/video/music/tracks";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type Db = SupabaseClient<Database>;

export const REEL_PREFIX = "reel:";
export function isHypeReel(id: string | null | undefined): boolean {
  return !!id && id.startsWith(REEL_PREFIX);
}
/** Encode: reel:<introV2;outroV2;accent,accent>  (accents comma-separated). */
export function encodeReelJobs(intro: string, outro: string, accents: string[]): string {
  return `${REEL_PREFIX}${intro};${outro};${accents.join(",")}`;
}
export function decodeReelJobs(id: string): {
  intro: string; outro: string; accents: string[];
} {
  const [intro = "", outro = "", acc = ""] = id.slice(REEL_PREFIX.length).split(";");
  return { intro, outro, accents: acc.split(",").filter(Boolean) };
}

async function fetchBuffer(url: string): Promise<Buffer> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`fetch ${res.status} for ${url.slice(0, 80)}`);
  return Buffer.from(await res.arrayBuffer());
}

export interface ReelListingFacts {
  price: string | null;
  beds: number | null;
  baths: number | null;
  sqft: number | null;
  address: string | null;
}

export interface AssemblableReel {
  id: string;
  user_id: string;
  heygen_video_id: string | null;
  /** Real listing photos — the faithful backbone. */
  photos: string[];
  facts: ReelListingFacts;
  featureCallouts: string[];
  trackId: string | null;
}

const ROOM_PHOTO_SHOTS = 3;
const BEATS_PER_SHOT = 4;
const OVERLAY_SHOW_MS = 1600;

export async function assembleHypeReel(supabase: Db, reel: AssemblableReel): Promise<
  "processing" | "completed" | "failed"
> {
  if (!isHypeReel(reel.heygen_video_id)) return "processing";
  const { intro, outro, accents } = decodeReelJobs(reel.heygen_video_id!);
  try {
    // Poll all sub-jobs: host bookends (v2) + accents (v3).
    const [introS, outroS] = await Promise.all([
      getVideoStatus(intro),
      getVideoStatus(outro),
    ]);
    const accentS = await Promise.all(accents.map(getCinematicClipStatus));
    const all = [introS, outroS, ...accentS];
    if (all.some((s) => s.status === "failed")) {
      const reason =
        ([introS, outroS].find((s) => s.status === "failed")?.error) ||
        accentS.find((s) => s.status === "failed")?.error ||
        "A Hype Reel shot failed to render.";
      await supabase.from("videos").update({ status: "failed", error: reason }).eq("id", reel.id);
      return "failed";
    }
    if (all.some((s) => s.status !== "completed")) return "processing";

    // Claim the row so only one assembler runs the heavy path.
    const { data: claimed } = await supabase
      .from("videos").update({ status: "submitting" })
      .eq("id", reel.id).eq("status", "processing").select("id");
    if (!claimed || claimed.length === 0) return "processing";

    const introUrl = introS.videoUrl!;
    const outroUrl = outroS.videoUrl!;
    const accentUrls = accentS.map((s) => s.videoUrl).filter(Boolean) as string[];

    const track = getTrack(reel.trackId);
    const durations = roomDurationsMs(track.bpm, BEATS_PER_SHOT, ROOM_PHOTO_SHOTS);

    const [introBuf, outroBuf, photoBufs, accentBufs, musicBuf] = await Promise.all([
      fetchBuffer(introUrl),
      fetchBuffer(outroUrl),
      Promise.all(reel.photos.slice(0, ROOM_PHOTO_SHOTS).map(fetchBuffer)),
      Promise.all(accentUrls.map(fetchBuffer)),
      readFile(resolve(track.file)),
    ]);

    // Scenes: host intro -> [photo, photo, accent, photo...] -> host outro.
    const room: MontageScene[] = [];
    let ai = 0;
    photoBufs.forEach((buf, i) => {
      room.push({ kind: "photo", imageBuf: buf, motion: motionForIndex(i), durationMs: durations[i] });
      if (ai < accentBufs.length && i === 1) {
        room.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: durations[i] });
      }
    });
    while (ai < accentBufs.length) {
      room.push({ kind: "video", videoBuf: accentBufs[ai++], durationMs: durations[durations.length - 1] });
    }

    const scenes: MontageScene[] = [
      { kind: "video", videoBuf: introBuf, durationMs: 6000, keepAudio: true },
      ...room,
      { kind: "video", videoBuf: outroBuf, durationMs: 6000, keepAudio: true },
    ];

    // Overlays land on beats within the montage (after the intro).
    const introMs = 6000;
    const montageMs = room.reduce((a, s) => a + s.durationMs, 0);
    const grid = beatTimesMs(track.bpm, track.beatOffsetMs, montageMs).map((t) => t + introMs);
    const overlays = overlaysFromListing({
      ...reel.facts,
      featureCallouts: reel.featureCallouts,
      beatGrid: grid,
      showDurMs: OVERLAY_SHOW_MS,
    });

    const assembled = await assembleMontage({
      scenes,
      audio: { music: musicBuf, duckUnderSceneAudio: true },
      overlays,
    });

    const storage = adminConfigured ? createAdminClient() : supabase;
    const path = `${reel.user_id}/${reel.id}.mp4`;
    const up = await storage.storage.from("video-cache")
      .upload(path, assembled, { contentType: "video/mp4", upsert: true });
    if (up.error) throw new Error(`upload failed: ${up.error.message}`);
    const { data: signed } = await storage.storage.from("video-cache")
      .createSignedUrl(path, 60 * 60 * 24 * 7);

    const totalSec = Math.round((introMs + montageMs + 6000) / 1000);
    await supabase.from("videos").update({
      status: "completed",
      video_url: signed?.signedUrl ?? null,
      duration: totalSec,
    }).eq("id", reel.id);
    return "completed";
  } catch (e) {
    await supabase.from("videos").update({
      status: "failed",
      error: e instanceof Error ? e.message : "Hype Reel assembly failed.",
    }).eq("id", reel.id);
    return "failed";
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add lib/video/hypereel.ts
git commit -m "feat: Hype Reel assembler (host bookends + photo tour + music + overlays)"
```

---

### Task 10: `submitHypeReelVideo` action

**Files:**
- Modify: `app/(app)/videos/actions.ts`

- [ ] **Step 1: Add the action**

Add imports at the top of `actions.ts`:

```ts
import { generateHypeReelScript } from "@/lib/ai/script";
import { encodeReelJobs } from "@/lib/video/hypereel";
import { fmtPrice } from "@/lib/format"; // if absent, format inline (see Step 2 note)
```

Add the action (mirrors `submitCinematicVideo`'s consent gate + twin check):

```ts
/** Hype Reel: v2 host bookends + real-photo tour + <=1 accent + music + overlays. */
export async function submitHypeReelVideo(videoId: string, trackId?: string) {
  const { userId } = await requireUser();
  const supabase = await createClient();
  const { data: video } = await supabase
    .from("videos").select("*, listings(*), avatars(*)").eq("id", videoId).single();
  if (!video) return;

  const listing = video.listings as Tables<"listings"> | null;
  const avatar = video.avatars as Tables<"avatars"> | null;
  const isTwin =
    !!avatar?.heygen_asset_id && avatar.heygen_asset_id !== avatar.heygen_avatar_id;

  const fail = async (error: string) => {
    await supabase.from("videos").update({ status: "failed", error }).eq("id", videoId);
    revalidatePath(`/videos/${videoId}`);
  };

  if (!avatar || !isTwin || !avatar.heygen_avatar_id) {
    return fail("Hype Reel needs a digital-twin avatar.");
  }
  if (!isMock) {
    const consent = await getTwinConsentStatus(avatar.heygen_asset_id!);
    if (!isConsentVerified(consent)) {
      return fail("Verify your twin's identity (Settings → Avatar → Cinematic mode) to use Hype Reel.");
    }
  }
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];
  if (photos.length === 0) return fail("Add listing photos to generate a Hype Reel.");
  const hero = photos[0];

  await supabase.from("videos").update({ status: "submitting" }).eq("id", videoId);

  try {
    const script = await generateHypeReelScript(listing as Tables<"listings">);
    const avatarKind = "digital_twin" as const;
    const webhookUrl = `${env.siteUrl}/api/webhooks/heygen?secret=${env.heygenWebhookSecret}`;
    // Host bookends (v2 presenter, twin over the hero photo).
    const [introJob, outroJob] = await Promise.all([
      generateVideo({ avatarId: avatar.heygen_avatar_id!, avatarKind, voiceId: avatar.voice_id ?? undefined, script: script.intro, photoUrls: [hero], title: video.title ?? undefined, webhookUrl }),
      generateVideo({ avatarId: avatar.heygen_avatar_id!, avatarKind, voiceId: avatar.voice_id ?? undefined, script: script.outro, photoUrls: [hero], title: video.title ?? undefined, webhookUrl }),
    ]);
    // One AI accent (flair) from the hero photo.
    const accent = await generateCinematicClip({
      avatarLookId: avatar.heygen_avatar_id!,
      referenceUrl: hero,
      prompt: cinematicPrompt(listing, 0, 1),
      duration: 8,
    });

    await supabase.from("videos").update({
      heygen_video_id: encodeReelJobs(introJob.videoId, outroJob.videoId, [accent.jobId]),
      status: "processing",
      thumbnail_url: hero,
      // Stash callouts so the assembler (poll/cron) doesn't need to re-run the model.
      script_segments: { hypeReel: { featureCallouts: script.featureCallouts, trackId: trackId ?? "default" } } as unknown as Json,
    }).eq("id", videoId).eq("user_id", userId);
  } catch (e) {
    await fail(e instanceof Error ? e.message : "Hype Reel generation failed.");
    return;
  }
  revalidatePath(`/videos/${videoId}`);
}
```

Note (Step 2 of imports): if `fmtPrice` does not exist in `lib/format.ts`, drop that import; price formatting for overlays happens in the poll/cron wiring (Task 11) using the inline pattern already in `lib/ai/script.ts` (`$${Math.round(Number(price)).toLocaleString("en-US")}`).

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "app/(app)/videos/actions.ts"
git commit -m "feat: submitHypeReelVideo — host bookends + tour + accent jobs"
```

---

### Task 11: Route polling + cron to the Hype Reel assembler

**Files:**
- Modify: `app/(app)/videos/actions.ts` (`pollVideoStatus`)
- Modify: `app/api/cron/reconcile-videos/route.ts`

- [ ] **Step 1: Build the reel facts helper (shared)**

Add to `app/(app)/videos/actions.ts` (above `pollVideoStatus`):

```ts
import { isHypeReel, assembleHypeReel, type ReelListingFacts } from "@/lib/video/hypereel";

function reelFacts(listing: Tables<"listings"> | null): ReelListingFacts {
  return {
    price: listing?.price ? `$${Math.round(Number(listing.price)).toLocaleString("en-US")}` : null,
    beds: listing?.beds ?? null,
    baths: listing?.baths ?? null,
    sqft: listing?.sqft ?? null,
    address: listing?.address ?? null,
  };
}
```

- [ ] **Step 2: Add the reel branch to `pollVideoStatus`**

Widen the poll select to fetch listing facts + photos + `script_segments`, and add a branch before the cinematic one:

```ts
  const { data: video } = await supabase
    .from("videos")
    .select("*, listings(*)")
    .eq("id", videoId)
    .single();
  if (!video) return null;
  const listing = video.listings as Tables<"listings"> | null;
  const photos = listing ? listingPhotos(listing.photos).map((p) => p.url) : [];

  if (isHypeReel(video.heygen_video_id) && video.status === "processing") {
    const meta = (video.script_segments as { hypeReel?: { featureCallouts?: string[]; trackId?: string } } | null)?.hypeReel;
    await assembleHypeReel(supabase, {
      id: video.id,
      user_id: video.user_id,
      heygen_video_id: video.heygen_video_id,
      photos,
      facts: reelFacts(listing),
      featureCallouts: meta?.featureCallouts ?? [],
      trackId: meta?.trackId ?? null,
    });
    const { data: latest } = await supabase.from("videos").select("*").eq("id", videoId).single();
    return latest ?? video;
  }
```

(Keep the existing cinematic branch below it; it can reuse the `photos` computed here — replace its inline photo computation accordingly.)

- [ ] **Step 3: Add the reel pass to the cron**

In `app/api/cron/reconcile-videos/route.ts`, after the cinematic loop, add a reel loop. The non-cinematic `stuck` loop already skips reel rows? No — it would call `getVideoStatus(reel:...)`. Guard it: in the first `stuck` loop add `if (isHypeReel(v.heygen_video_id)) continue;` next to the `isCinematic` skip. Then:

```ts
import { isHypeReel, assembleHypeReel } from "@/lib/video/hypereel";
import { listingPhotos } from "@/lib/format";
// ...
  const { data: reelVideos } = await supabase
    .from("videos")
    .select("id, user_id, heygen_video_id, status, listing_id, script_segments")
    .in("status", ["processing", "submitting"])
    .like("heygen_video_id", "reel:%")
    .limit(20);

  let reelsAssembled = 0;
  for (const v of reelVideos ?? []) {
    if (!isHypeReel(v.heygen_video_id)) continue;
    if (v.status === "submitting") {
      await supabase.from("videos").update({ status: "processing" }).eq("id", v.id).eq("status", "submitting");
    }
    const { data: lst } = await supabase.from("listings").select("*").eq("id", v.listing_id ?? "").maybeSingle();
    const photos = lst ? listingPhotos(lst.photos).map((p) => p.url) : [];
    const meta = (v.script_segments as { hypeReel?: { featureCallouts?: string[]; trackId?: string } } | null)?.hypeReel;
    const result = await assembleHypeReel(supabase, {
      id: v.id, user_id: v.user_id, heygen_video_id: v.heygen_video_id, photos,
      facts: {
        price: lst?.price ? `$${Math.round(Number(lst.price)).toLocaleString("en-US")}` : null,
        beds: lst?.beds ?? null, baths: lst?.baths ?? null, sqft: lst?.sqft ?? null, address: lst?.address ?? null,
      },
      featureCallouts: meta?.featureCallouts ?? [], trackId: meta?.trackId ?? null,
    });
    if (result === "completed") reelsAssembled++;
  }
```

Add `reelsChecked`/`reelsAssembled` to the final JSON response.

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add "app/(app)/videos/actions.ts" app/api/cron/reconcile-videos/route.ts
git commit -m "feat: route poll + cron to Hype Reel assembler"
```

---

### Task 12: UI — Hype Reel button + track picker

**Files:**
- Modify: `components/videos/video-detail.tsx`
- Modify: `app/(app)/videos/[id]/page.tsx`

- [ ] **Step 1: Pass the track list into `VideoDetail`**

In `app/(app)/videos/[id]/page.tsx`, import the tracks and pass them:

```tsx
import { TRACKS } from "@/lib/video/music/tracks";
// ...
      <VideoDetail
        initialVideo={videoRow}
        cinematicReady={cinematicReady}
        hasTwin={isTwin}
        tracks={TRACKS.map((t) => ({ id: t.id, title: t.title }))}
      />
```

- [ ] **Step 2: Add the button + picker to `VideoDetail`**

Add `submitHypeReelVideo` to the imports from actions, extend props, add a track state + handler, and render a Hype Reel button in the `cinematicReady` block:

```tsx
import { submitVideo, submitCinematicVideo, submitHypeReelVideo, updateScript, pollVideoStatus } from "@/app/(app)/videos/actions";
// props:
  tracks = [],
}: {
  initialVideo: Video;
  cinematicReady?: boolean;
  hasTwin?: boolean;
  tracks?: { id: string; title: string }[];
}) {
  const [trackId, setTrackId] = useState(tracks[0]?.id ?? "default");
// handler:
  function handleHypeReel() {
    startTransition(async () => {
      await updateScript(video.id, script);
      setVideo((v) => ({ ...v, status: "submitting" }));
      await submitHypeReelVideo(video.id, trackId);
      const latest = await pollVideoStatus(video.id);
      if (latest) setVideo(latest);
    });
  }
```

Inside the `cinematicReady ? ( <> ... </> )` button group (after the "Generate cinematic" button), add:

```tsx
                {tracks.length > 0 ? (
                  <select
                    value={trackId}
                    onChange={(e) => setTrackId(e.target.value)}
                    className="rounded-full border border-border bg-background px-3 text-sm"
                    aria-label="Hype Reel music track"
                  >
                    {tracks.map((t) => (
                      <option key={t.id} value={t.id}>{t.title}</option>
                    ))}
                  </select>
                ) : null}
                <Button
                  onClick={handleHypeReel}
                  disabled={pending || !script.trim()}
                  size="lg"
                  className="rounded-full bg-accent text-accent-foreground hover:bg-foreground hover:text-accent"
                  title="On-camera host + beat-synced tour of your real photos, set to music"
                >
                  <Film className="size-5" />
                  {pending ? "Working…" : "Generate hype reel"}
                </Button>
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add components/videos/video-detail.tsx "app/(app)/videos/[id]/page.tsx"
git commit -m "feat: Hype Reel UI — generate button + music track picker"
```

---

## Phase 5 — Full verification

### Task 13: Mock E2E both modes + build

**Files:** none (verification only)

- [ ] **Step 1: Regenerate the dev track (if not committed)**

Run: `node scripts/make-dev-track.mjs`
Expected: `✓ wrote public/music/default.mp3 (dev placeholder)`

- [ ] **Step 2: Run all ffmpeg smokes**

Run:
```bash
node scripts/stitch-smoke.mjs
node --experimental-strip-types scripts/kenburns-smoke.mjs
node --experimental-strip-types scripts/overlay-smoke.mjs
node --experimental-strip-types scripts/montage-smoke.mjs
node --experimental-strip-types scripts/beats-check.mjs
```
Expected: every script prints its `✓` line.

- [ ] **Step 3: Mock E2E**

Run (terminal A): `HEYGEN_MOCK=1 npm run dev`
Run (terminal B): `BASE_URL=http://localhost:3000 node scripts/e2e.mjs`
Then manually, for a listing with ≥3 photos and a consent-verified twin (mock makes consent pass): generate a **cinematic** video and a **Hype Reel**; confirm both reach `completed`, the player shows the **real photos** with motion, the Hype Reel opens/closes with the talking host and plays the dev track, and overlays appear (if drawtext smoke passed).

- [ ] **Step 4: Production build / full typecheck**

Run: `npm run build`
Expected: build succeeds (this is also the fullest typecheck).

- [ ] **Step 5: Lint**

Run: `npm run lint`
Expected: no new errors.

- [ ] **Step 6: Commit any final fixes**

```bash
git add -A
git commit -m "test: verify Hype Reel + faithful cinematic end-to-end (mock)"
```

---

## Self-Review notes (addressed)

- **Spec coverage:** faithfulness principle (Tasks 5–6, 9), shared primitive (Tasks 2–4), Hype Reel host bookends (Task 10), beat-synced cuts (Tasks 1, 9), overlays (Tasks 3, 9), music library (Task 7), script variant (Task 8), poll+cron orchestration (Tasks 5, 11), UI (Tasks 6, 12), mock/no-key flow (dev track + mock statuses), no migrations (job-id encoding). Presenter unchanged (already compliant) — intentionally no task.
- **ffmpeg risk:** zoompan + drawtext are gated by Phase-1 smokes before anything builds on them; overlays are optional if drawtext is unavailable.
- **Type consistency:** `assembleMontage({scenes,audio,overlays})`, `MontageScene` discriminated union, `encodeReelJobs/decodeReelJobs`, `isHypeReel`, `AssemblableReel.facts/featureCallouts/trackId`, and `AssemblableVideo.photos` are used identically across tasks.
- **Known follow-ups (out of scope, noted in spec):** perfect downbeat phase-alignment of the intro→montage seam (v1 uses uniform beat-spaced cuts); replacing the dev placeholder track with licensed audio; twin-rapping R&D spike.

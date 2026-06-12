import "server-only";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import ffmpegPath from "ffmpeg-static";
import { kenBurnsFilter, type KenBurnsMotion } from "./kenburns";
import { buildOverlayFilter, type Overlay } from "./overlay";

const FPS = 30; // dimensions are hardcoded in filter strings (minifier-safe)
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

/** Fixed Hype Reel length (independent of the song). Tunable in one place. */
export const HYPE_REEL_TARGET_MS = 15000;

/**
 * Whether the bundled ffmpeg has the `drawtext` filter. The Vercel (Linux)
 * ffmpeg-static binary does NOT include it even though macOS does — so overlays
 * must degrade gracefully (render the video without burned-in text) rather than
 * crash the whole assembly. Cached after the first probe.
 */
let drawtextSupport: Promise<boolean> | null = null;
function supportsDrawtext(): Promise<boolean> {
  if (drawtextSupport) return drawtextSupport;
  drawtextSupport = new Promise((resolve) => {
    if (!ffmpegPath) return resolve(false);
    execFile(
      ffmpegPath as string,
      ["-hide_banner", "-filters"],
      { maxBuffer: 1 << 24 },
      (e, stdout) => resolve(!e && /\bdrawtext\b/.test(stdout || "")),
    );
  });
  return drawtextSupport;
}

/** Read a media file's duration (ms) by parsing ffmpeg's probe output. */
function probeDurationMs(path: string): Promise<number> {
  if (!ffmpegPath) return Promise.resolve(0);
  return new Promise((resolve) =>
    execFile(ffmpegPath as string, ["-i", path], (_e, _so, stderr) => {
      const m = /Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(stderr || "");
      if (!m) return resolve(0);
      resolve((+m[1] * 3600 + +m[2] * 60 + parseFloat(m[3])) * 1000);
    }),
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
      "-f", "lavfi", "-t", durSec, "-i", "anullsrc=r=44100:cl=stereo",
      "-filter_complex", filter, "-map", "[v]", "-map", "1:a:0",
      "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
      "-r", String(FPS), outPath,
    ]);
    return;
  }
  // video scene: normalize to 720x1280/30fps, trim to duration. Every segment
  // carries a stereo audio track (real for host scenes, silent otherwise) so the
  // concat demuxer sees a uniform layout.
  // Dimensions are HARDCODED (not `${W}:${H}`) on purpose: the Next 16 production
  // minifier corrupts a filter built from consecutive `${W}:${H}` interpolations,
  // dropping the trailing literal (-> "scale=720:1280pad..." which ffmpeg rejects).
  // A plain literal survives minification (same pattern as lib/video/stitch.ts).
  const vf =
    "scale=720:1280:force_original_aspect_ratio=decrease," +
    "pad=720:1280:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30";
  if (scene.keepAudio) {
    // Keep the clip's own audio (e.g. host voice-over). Use amix with a silent
    // source so clips lacking an audio track still produce a stereo segment.
    await ff([
      "-y", "-i", inPath,
      "-f", "lavfi", "-t", durSec, "-i", "anullsrc=r=44100:cl=stereo",
      "-t", durSec, "-vf", vf,
      "-filter_complex", "[0:a:0]aformat=sample_rates=44100:channel_layouts=stereo[ha];[ha][1:a:0]amix=inputs=2:duration=first:dropout_transition=0[aout]",
      "-map", "0:v:0", "-map", "[aout]",
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
    "-c:a", "aac", "-b:a", "192k", "-ar", "44100", outPath,
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

    // 3) Final pass: overlays + audio. Overlays need the `drawtext` filter, which
    // the Vercel ffmpeg-static binary lacks — drop them there so the render still
    // succeeds (video without burned-in text) instead of crashing.
    const out = join(dir, "out.mp4");
    const wantOverlays = opts.overlays ?? [];
    const overlays = wantOverlays.length && (await supportsDrawtext())
      ? wantOverlays
      : [];
    if (wantOverlays.length && !overlays.length) {
      console.warn("[montage] drawtext unavailable — rendering without text overlays");
    }
    const overlayFilter = buildOverlayFilter("[0:v]", "[vout]", overlays, FONT);

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

      // FIXED length, independent of the song: clamp to HYPE_REEL_TARGET_MS and
      // fade out at the very end. If the montage is shorter than the target, hold
      // the last frame (tpad) so the video is always exactly the target length;
      // the looped music is bounded by the final `-t`.
      const realMs = await probeDurationMs(concatV);
      const targetMs = HYPE_REEL_TARGET_MS;
      const Dsec = (targetMs / 1000).toFixed(3);
      const padSec = Math.max(0, (targetMs - realMs) / 1000);
      const vFadeStart = Math.max(0, targetMs / 1000 - 1.0).toFixed(3);
      const aFadeStart = Math.max(0, targetMs / 1000 - 1.2).toFixed(3);

      // Overlays -> (hold last frame to target) -> 1s fade to black.
      const ov = buildOverlayFilter("[0:v]", "[vov]", overlays, FONT);
      const vHold =
        padSec > 0.04
          ? `[vov]tpad=stop_mode=clone:stop_duration=${padSec.toFixed(3)}[vh];[vh]`
          : `[vov]`;
      const videoGraph = `${ov};${vHold}fade=t=out:st=${vFadeStart}:d=1.0[vout]`;

      // `[vo]` is consumed twice (sidechain key + mix), so split it first — an
      // ffmpeg filter label can only be read once. Fade the final mix out at end.
      const audioCore = opts.audio.duckUnderSceneAudio
        ? `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[mus];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[vokey][vomix];` +
          `[mus][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked];` +
          `[ducked][vomix]amix=inputs=2:duration=first:dropout_transition=0[amix]`
        : `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.8[amix]`;
      const audioGraph = `${audioCore};[amix]afade=t=out:st=${aFadeStart}:d=1.2[aout]`;

      await ff([
        "-y", "-i", concatV, "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", `${videoGraph};${audioGraph}`,
        "-map", "[vout]", "-map", "[aout]", "-t", Dsec,
        "-c:v", "libx264", "-preset", "medium", "-crf", "18", "-pix_fmt", "yuv420p",
        "-c:a", "aac", "-b:a", "192k", "-movflags", "+faststart", out,
      ]);
    } else {
      throw new Error("montage audio: provide narration or music");
    }

    return await readFile(out);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

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
  const vf =
    `scale=${W}:${H}:force_original_aspect_ratio=decrease,` +
    `pad=${W}:${H}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=${FPS}`;
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
      // The music input is looped forever (`-stream_loop -1`); `-shortest` does
      // NOT reliably stop an infinitely-looped filtered stream, so bound the
      // output to the montage length explicitly with `-t`.
      const totalSec = (
        opts.scenes.reduce((ms, s) => ms + s.durationMs, 0) / 1000
      ).toFixed(3);
      const audioGraph = opts.audio.duckUnderSceneAudio
        ? // sidechain: music keyed by the concat audio (host VO) -> duck, then mix VO
          // back on top. `[vo]` is consumed twice (key + mix), so split it first —
          // an ffmpeg filter label can only be read once.
          `[1:a]aformat=sample_rates=44100:channel_layouts=stereo[mus];` +
          `[0:a]aformat=sample_rates=44100:channel_layouts=stereo,asplit=2[vokey][vomix];` +
          `[mus][vokey]sidechaincompress=threshold=0.03:ratio=8:attack=20:release=300[ducked];` +
          `[ducked][vomix]amix=inputs=2:duration=first:dropout_transition=0[aout]`
        : `[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=0.8[aout]`;
      await ff([
        "-y", "-i", concatV, "-stream_loop", "-1", "-i", musicPath,
        "-filter_complex", `${overlayFilter};${audioGraph}`,
        "-map", "[vout]", "-map", "[aout]", "-t", totalSec,
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

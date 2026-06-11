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

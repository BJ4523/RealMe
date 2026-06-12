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

const FPS = 30; // output frame rate (dimensions are hardcoded in the filter)

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
  // Dimensions HARDCODED (not `${W}x${H}` / `${OVERSAMPLE}`): the Next 16 minifier
  // corrupts filters built from adjacent numeric interpolations. Only the dynamic
  // motion exprs (z/x/y/frames) are interpolated. See lib/video/scenes.ts note.
  return (
    `${inLabel}scale=1440:2560:force_original_aspect_ratio=increase,` +
    `crop=1440:2560,` +
    `zoompan=z='${z}':x='${x}':y='${y}':d=${frames}:s=720x1280:fps=30,` +
    `setsar=1${outLabel}`
  );
}

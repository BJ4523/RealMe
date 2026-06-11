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

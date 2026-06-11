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
  /** Repo-relative file path (also the public path under /music). */
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

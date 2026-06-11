/**
 * Royalty-free music library for Hype Reel. Each track is pre-annotated with its
 * tempo + lead-in so beats.ts can sync cuts WITHOUT runtime beat detection.
 * Files live in public/music and are traced into the function (next.config.ts).
 *
 * IMPORTANT: ship only properly-licensed audio. Confirm the license permits
 * bundling in a SaaS that generates videos for end users (most "royalty-free"
 * creator licenses do NOT — prefer CC0/public-domain or an explicit multi-user
 * license).
 */
export interface MusicTrack {
  id: string;
  title: string;
  /** Repo-relative file path the assembler reads server-side. */
  file: string;
  /** Public URL (served from /public) for the in-app preview player. */
  previewUrl: string;
  bpm: number;
  /** Ms until the first downbeat (0 if the track starts on the beat). */
  beatOffsetMs: number;
  durationSec: number;
  mood: string;
}

export const TRACKS: MusicTrack[] = [
  {
    id: "hype",
    title: "Hype",
    file: "public/music/hype.mp3",
    previewUrl: "/music/hype.mp3",
    bpm: 140,
    beatOffsetMs: 0,
    durationSec: 104,
    mood: "energetic",
  },
];

export function getTrack(id: string | null | undefined): MusicTrack {
  return TRACKS.find((t) => t.id === id) ?? TRACKS[0];
}

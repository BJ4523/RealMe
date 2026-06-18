/**
 * Pure reel-timing planner — shared by the generation UI and the submit actions so
 * the SAME math drives the on-screen duration estimate AND the actual script length.
 * No I/O, client-safe.
 */

/** Approx. spoken words per second (the cloned voices land ~2.5). */
export const WORDS_PER_SEC = 2.5;
/** The lip-synced talking bookends are short, fixed-ish clips. */
export const OPENER_SEC = 4;
export const CLOSER_SEC = 4;

/**
 * First sentence of a script, capped to `maxWords` — the SHORT line a TWIN bookend
 * clip is lip-synced to. A long bookend line makes the spoken audio far exceed the
 * ≤15s clip, which HeyGen lipsync rejects (>15% length mismatch).
 */
export function shortLine(text: string, maxWords = 16, minWords = 7): string {
  const sentences = (text || "").split(/(?<=[.!?])\s+/).map((s) => s.trim()).filter(Boolean);
  // Accumulate whole sentences until we have a real line (≥ minWords), stopping
  // before we'd exceed maxWords — so a tiny first sentence ("Hi there.") still picks
  // up the next, and a long pitch is capped to one clean opening line.
  const out: string[] = [];
  let count = 0;
  for (const s of sentences) {
    const n = s.split(/\s+/).filter(Boolean).length;
    if (count >= minWords && count + n > maxWords) break;
    out.push(s);
    count += n;
    if (count >= maxWords) break;
  }
  const line = out.join(" ").trim() || (text || "").trim();
  const w = line.split(/\s+/).filter(Boolean);
  return w.length > maxWords ? w.slice(0, maxWords).join(" ") : line;
}

/**
 * Given a TARGET duration (seconds) and a ROOM count (selected photos), plan the
 * per-room narration so the finished reel lands near the target: short lip-synced
 * bookends + the remaining budget split across the room photos. `roomWords` is what
 * the script generator is told to write per room → the spoken length (and the clip
 * durations, which are sized to it) track the target. Per-room is clamped [3s, 12s]
 * (a Ken-Burns pan / Runway clip reads well in that band), so very few rooms for a
 * long target, or many rooms for a short one, will drift — `estSec` reflects reality.
 */
export function planReel(
  targetSec: number,
  roomCount: number,
): { roomWords: number; perRoomSec: number; estSec: number } {
  const rooms = Math.max(1, roomCount);
  const roomBudget = Math.max(rooms * 3, targetSec - OPENER_SEC - CLOSER_SEC);
  const perRoomSec = Math.min(12, Math.max(3, Math.round(roomBudget / rooms)));
  const roomWords = Math.max(5, Math.round(perRoomSec * WORDS_PER_SEC));
  const estSec = OPENER_SEC + rooms * perRoomSec + CLOSER_SEC;
  return { roomWords, perRoomSec, estSec };
}

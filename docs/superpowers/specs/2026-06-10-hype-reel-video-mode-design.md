# Hype Reel — third video mode design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Branch context:** `feature/cinematic-default`

## Summary

A third video mode — **Hype Reel** — alongside `presenter` and `cinematic`. It produces a
~20s vertical (9:16) "produced TV segment" for a listing: the agent's digital twin **hosts
on camera** (lip-synced cloned voice) as bookends around a **beat-synced cinematic room tour**,
all over a royalty-free music bed with **kinetic text overlays** auto-pulled from listing data.

This was scoped as the "wow-factor" alternative to a twin-rapping music video. The rapping idea
was deferred because it requires unsolved R&D (a second voice clone for singing + HeyGen lip-sync
surviving rap tempo). Hype Reel keeps the twin + music + cinematic energy while using **only
existing plumbing** for the AI calls; the genuinely new work is one ffmpeg assembler.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Mode name | **Hype Reel** (changeable) |
| Length | ~20s — host intro + **3** cinematic room shots + host outro |
| Host on camera | Yes — v2 presenter lip-sync bookends (intro + outro) |
| Host backdrop | Over the **listing hero photo** (reuses presenter path untouched) |
| Music source | **Hosted royalty-free library**, tracks pre-annotated with BPM/beat grid |
| Beat-synced cuts | Yes — room clips trimmed to whole beats |
| Text overlays | Yes — auto from listing data (price, beds/baths/sqft, address, 2–3 feature callouts) |
| Consent | Gated like cinematic (stars the twin; cinematic clips require consent) |
| Migrations | None — job state encoded in `videos.heygen_video_id` (free-text), same trick as cinematic |

## Timeline

```
[Host intro ~5s]  →  [Room 1] [Room 2] [Room 3]  →  [Host outro ~4s]
   twin on cam        beat-synced cinematic tour       twin on cam, CTA
   talking            (silent clips + text overlays)    talking
   music ducked       music full volume                 music ducked
```

## Architecture

### Reused as-is (existing plumbing)
- `generateCinematicClip({ avatarLookId, referenceUrl?, prompt, duration? }) → { jobId }`
  (`lib/heygen/cinematic.ts`) — the 3 room clips.
- `getCinematicClipStatus(jobId) → { status, videoUrl?, error? }` — v3 clip polling.
- `generateVideo(...)` v2 presenter render (`lib/heygen/video.ts`) — the 2 host bookends; returns
  an MP4 with synced voice baked in.
- Consent: `getTwinConsentStatus` + `isConsentVerified` (`lib/heygen/avatar.ts`).
- Storage: `video-cache` bucket, admin-client upload, 7-day signed URL (same as cinematic).
- Cron backstop: `app/api/cron/reconcile-videos` — extend its query to also pick up reel rows.
- Self-locking `processing→submitting` assembly pattern from `assembleCinematicVideo`.
- Mock mode (`HEYGEN_MOCK=1`) — fake clip ids + sample MP4; assembly still runs the real ffmpeg
  path on samples + a bundled sample track, so the full flow is dev-testable with no keys.

### Net-new components

1. **Track library** — `lib/video/music/tracks.ts`
   - Static list of royalty-free tracks; files in `public/music/` (or `video-cache`-style asset).
   - Each entry: `{ id, title, url, bpm, beatOffsetMs, durationSec, mood }`.
   - v1 ships with one default track; dropdown selects among any present.

2. **Beat math** — `lib/video/music/beats.ts` (PURE, side-effect-free → unit-testable)
   - `beatTimesMs(bpm, beatOffsetMs, untilMs): number[]`
   - `clipDurationsForBeats(bpm, beatOffsetMs, shotCount, windowMs): number[]` — returns each
     room clip's trimmed duration so cuts land on beat boundaries.

3. **Overlay builder** — `lib/video/overlay.ts` (PURE → unit-testable)
   - `buildDrawtextFilters(overlays: Overlay[], beatTimesMs): string` — emits the ffmpeg
     `drawtext` filter chain (text, position, fade-in/out enable expressions on beats).
   - `Overlay = { text, lane: 'price'|'stats'|'address'|'feature', startMs }`.

4. **Script variant** — extend `lib/ai/script.ts`
   - Returns `{ intro: string, outro: string, featureCallouts: string[] }` (Zod schema).
   - Templated fallback when `ANTHROPIC_API_KEY` is unset (matches existing script behavior).

5. **Assembler** — `lib/video/hypereel.ts` → `assembleHypeReel(supabase, video, voiceId)`
   - Sibling to `assembleCinematicVideo`. Same signature/return contract
     (`"processing" | "completed" | "failed"`), same self-lock.

6. **Stitch helper** — extend `lib/video/stitch.ts`
   - New `stitchHypeReel({ introClip, roomClips, outroClip, musicBuf, overlays, beatGrid })`.
   - Reuses the existing 9:16 normalize/pad/fps logic; adds beat-trim, drawtext, and audio mix.

7. **Submit action** — `submitHypeReelVideo(videoId, trackId?)` in `app/(app)/videos/actions.ts`
   - Parallel to `submitCinematicVideo`. Same consent gate.

8. **Job encoding** — `lib/video/hypereel.ts`
   - `REEL_PREFIX = "reel:"`; encode as `reel:<introV2;outroV2;cineId,cineId,cineId>`.
   - `isHypeReel(id)`, `encodeReelJobs(...)`, `decodeReelJobs(...)`.

9. **UI** — `components/videos/video-detail.tsx` + `app/(app)/videos/[id]/page.tsx`
   - "Generate hype reel" button next to cinematic, gated on the same `cinematicReady` consent flag.
   - Simple track `<select>` (defaults to the one library track in v1).

## Data flow

```
submitHypeReelVideo(videoId, trackId?)
  → consent check (isConsentVerified) — fail with Settings → Avatar hint if not
  → select 3 listing photos + 1 hero photo
  → script: { intro, outro, featureCallouts }  (Claude or templated fallback)
  → fire in parallel:
       generateVideo(intro line, [hero])          → introV2 jobId
       generateVideo(outro line, [hero])          → outroV2 jobId
       generateCinematicClip(photo_i) × 3         → cineId × 3
  → write videos row: status=processing, heygen_video_id = reel:<...>
  → poll (UI 2.5s) AND cron both call assembleHypeReel:
       decode job ids → poll all 5 (v2 status + getCinematicClipStatus)
       if any processing → return "processing"
       if any failed → mark failed + reason
       else: self-lock processing→submitting, then:
         fetch 5 MP4 buffers + selected track buffer
         compute beat grid + per-room-clip durations
         build drawtext overlays from listing data + featureCallouts
         stitchHypeReel(...) → final 9:16 MP4
         upload to video-cache (admin client), signed URL (7d)
         update videos: status=completed, video_url, duration
```

## ffmpeg design (the core new work)

Single `ffmpeg` invocation, extending the existing `stitch.ts` pattern:

- **Video:** normalize all 5 segments to 720×1280 / 30fps / SAR 1 (existing logic). Trim the
  3 room clips to their beat-aligned durations (`-t` per input or `trim` filter). Concat in
  order: intro → room1 → room2 → room3 → outro.
- **Overlays:** chain `drawtext` filters over the montage section; fade in/out keyed to
  `beatTimesMs` via `enable='between(t,a,b)'` and `alpha` expressions. Bundled font.
- **Audio:** three sources mixed —
  - intro voice (from introV2, embedded) — plays during intro window
  - outro voice (from outroV2, embedded) — plays during outro window
  - music track — full length, volume automated **down ~-12dB** under intro/outro windows
    (`volume=enable=...` or two `volume` segments + `amix`), full during montage.
  - `-shortest` not used (timeline length is deterministic from segment durations); explicit
    total duration instead.
- Output: H.264 (CRF 18, medium preset), AAC 192k, `+faststart` — same as cinematic.

## Error handling

- Any sub-job `failed` → reel row `failed` with the sub-job's reason (mirror cinematic).
- `heygenFetch` throws on non-200 during a poll → caught by assembler, leaves row `processing`
  for the next poll/cron (mirror cinematic's resilience).
- Stale `submitting` lock (crashed assembly) → cron resets to `processing` (existing pattern).
- Missing listing photos → fail early in submit with actionable message.
- No consent → fail early with "Verify your twin's identity (Settings → Avatar → Cinematic mode)".

## Testing / verification

- Pure helpers (`beats.ts`, `overlay.ts`) kept side-effect-free for a future harness (per CLAUDE.md;
  no framework scaffolded now).
- `node scripts/verify-db.mjs` unaffected (no schema change).
- Manual: `HEYGEN_MOCK=1` end-to-end — submit a hype reel on a seeded listing, confirm the assembler
  produces a real stitched MP4 from sample clips + bundled sample track, lands in `video-cache`,
  and the row goes `completed`.
- `npm run build` for typecheck.

## Scope split

- **~70% reuse:** clip gen, presenter render, polling, cron, storage, consent, job-id encoding,
  status transitions, mock flow.
- **~30% new:** the ffmpeg assembler (beat-trim + drawtext + audio ducking), track library +
  beat math, script variant, submit action, UI button + track picker.

## Open / deferred

- **Deferred:** twin *rapping* (AI song-gen second voice clone + rap-tempo lip-sync) — revisit as
  a separate R&D spike if Hype Reel lands well.
- **v1 defaults:** one library track; host over hero photo; 3 room shots. Track library, backdrop
  styling, and shot count are the obvious post-v1 expansion levers.

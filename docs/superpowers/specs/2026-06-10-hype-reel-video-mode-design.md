# Hype Reel + faithful-tour retrofit — video modes design

**Date:** 2026-06-10
**Status:** Approved (pending spec review)
**Branch context:** `feature/cinematic-default`

## Summary

Two linked changes, unified by one new building block:

1. **New "Hype Reel" mode** — a ~20s vertical (9:16) "produced TV segment": the agent's digital
   twin **hosts on camera** (lip-synced cloned voice) as bookends around a **beat-synced tour**,
   over a royalty-free music bed with **kinetic text overlays** from listing data.
2. **Retrofit existing "Cinematic" mode** — today it shows **pure AI-generated fantasy rooms**,
   which violates the new faithfulness rule below. It is reworked to the same faithful model.

### Cross-cutting principle (applies to ALL video modes)

> **The real listing photos are the faithful backbone of every video. AI-generated cinematic
> (Seedance) clips are accents only — flair and transitions — never the entire tour.**

Mode compliance:

| Mode | Today | After this work |
| --- | --- | --- |
| **Presenter** | Real photos (faithful) | Unchanged — already compliant |
| **Cinematic** | Pure AI fantasy rooms ❌ | Real-photo motion tour + a few cinematic accents + narration ✅ |
| **Hype Reel** (new) | — | Real-photo motion tour + cinematic accents + host bookends + music + overlays ✅ |

This was scoped as the "wow-factor" alternative to a twin-rapping music video. Rapping was deferred
(needs unsolved R&D: a 2nd singing voice clone + lip-sync surviving rap tempo). Hype Reel keeps the
twin + music + cinematic energy while staying faithful to the real property.

## Decisions (locked)

| Decision | Choice |
| --- | --- |
| Faithfulness | Real photos = backbone everywhere; Seedance = accents only |
| Cinematic retrofit | **Yes, same effort** (not a fast-follow) |
| Mode name | **Hype Reel** (changeable) |
| Hype Reel length | ~20s — host intro + 3 room shots (real-photo + ≤1 cinematic accent) + host outro |
| Host on camera | Yes — v2 presenter lip-sync bookends (intro + outro) over the listing hero photo |
| Music source | Hosted royalty-free library, tracks pre-annotated with BPM/beat grid |
| Beat-synced cuts | Yes — room shots trimmed to whole beats |
| Text overlays | Yes — auto from listing data (price, beds/baths/sqft, address, 2–3 feature callouts) |
| Consent | Hype Reel + Cinematic gated on consent-verified twin |
| Migrations | None — job state encoded in `videos.heygen_video_id` (free-text), same as cinematic today |

## The shared new primitive: a "scene" model + faithful montage assembler

Both Cinematic and Hype Reel are built from an **ordered list of scenes**, normalized to 720×1280 /
30fps and concatenated in one ffmpeg pass. Scene types:

- `{ type: 'photo', url, durationMs, motion }` — **Ken Burns** pan/zoom over a **real listing
  photo** via ffmpeg `zoompan` (the faithful backbone — NEW).
- `{ type: 'cinematic', jobId, durationMs }` — a Seedance accent clip (trimmed). Existing
  `generateCinematicClip`, now used sparingly.
- `{ type: 'host', videoUrl }` — a v2 presenter lip-sync segment with embedded synced voice
  (Hype Reel bookends only). Existing `generateVideo`.

The montage assembler takes scenes + options (`{ narration? , music?, overlays?, beatGrid? }`)
and emits the final MP4. Cinematic and Hype Reel differ only in which options they pass.

## Architecture

### Reused as-is (existing plumbing)
- `generateCinematicClip(...)` / `getCinematicClipStatus(...)` (`lib/heygen/cinematic.ts`) — accents.
- `generateVideo(...)` v2 presenter (`lib/heygen/video.ts`) — Hype Reel host bookends.
- `generateSpeech(text, voiceId)` (`lib/heygen/voice.ts`) — Cinematic narration.
- Consent: `getTwinConsentStatus` + `isConsentVerified` (`lib/heygen/avatar.ts`).
- Storage: `video-cache` bucket, admin-client upload, 7-day signed URL.
- Cron backstop `app/api/cron/reconcile-videos` + self-locking `processing→submitting`.
- Mock mode (`HEYGEN_MOCK=1`): Ken Burns runs on real seeded photos; Seedance/host are sample MP4s
  → full flow dev-testable with no keys.

### Net-new components

1. **Scene model + montage assembler** — `lib/video/scenes.ts`
   - `Scene` type (above) + `assembleMontage({ scenes, narration?, music?, overlays?, beatGrid? })`.
   - Thin exec wrapper around a single ffmpeg `filter_complex` (built by pure helpers below).

2. **Ken Burns motion** — `lib/video/kenburns.ts` (PURE → unit-testable)
   - `kenBurnsFilter(motion, durationMs): string` — `zoompan`/scale-crop snippet per photo scene.
   - A small set of motion presets (slow zoom-in, pan-left, push-up, etc.) rotated per scene.

3. **Beat math** — `lib/video/music/beats.ts` (PURE → unit-testable)
   - `beatTimesMs(bpm, beatOffsetMs, untilMs)` and
     `clipDurationsForBeats(bpm, beatOffsetMs, shotCount, windowMs)`.

4. **Overlay builder** — `lib/video/overlay.ts` (PURE → unit-testable)
   - `buildDrawtextFilters(overlays, beatTimesMs): string` — `drawtext` chain with beat-keyed fades.

5. **Track library** — `lib/video/music/tracks.ts`
   - Static `{ id, title, url, bpm, beatOffsetMs, durationSec, mood }[]`; files in `public/music/`.
   - v1 ships one default track.

6. **Script variant** — extend `lib/ai/script.ts`
   - Hype Reel: `{ intro, outro, featureCallouts[] }` (Zod schema + templated fallback).
   - Cinematic keeps its existing narration script.

7. **Assemblers** (both call `assembleMontage`)
   - `lib/video/cinematic.ts` → `assembleCinematicVideo` **reworked**: build photo scenes from the
     real listing photos + interleave ≤1–2 cinematic accents; pass `narration` (existing TTS). Same
     signature/return contract, same self-lock.
   - `lib/video/hypereel.ts` → `assembleHypeReel`: host bookends + photo scenes + ≤1 accent;
     pass `music` + `overlays` + `beatGrid`. Sibling signature.

8. **Job encoding** (free-text `heygen_video_id`, migration-free)
   - Cinematic keeps `cine:<accentJobId,...>` — only the *accent* job ids; photo scenes are
     reconstructed from the listing at assembly time (no job needed).
   - Hype Reel `reel:<introV2;outroV2;accentJobId,...>`.
   - `isCinematic`/`isHypeReel` route the poll + cron to the right assembler.

9. **Submit actions** — `app/(app)/videos/actions.ts`
   - `submitCinematicVideo` updated (fewer/zero-to-few Seedance jobs; photos drive the tour).
   - `submitHypeReelVideo(videoId, trackId?)` added; same consent gate.

10. **UI** — `components/videos/video-detail.tsx` + `app/(app)/videos/[id]/page.tsx`
    - "Generate hype reel" button + track `<select>`, gated on the existing `cinematicReady` flag.
    - Cinematic's existing AI-approximation disclosure relaxed to reflect it's now real-photo-based
      with accents.

## Hype Reel timeline

```
[Host intro ~5s]  →  [Room 1] [Room 2] [Room 3]  →  [Host outro ~4s]
   twin on cam        real-photo Ken Burns +           twin on cam, CTA
   talking            ≤1 cinematic accent, beat-cut     talking
   music ducked       text overlays, music full         music ducked
```

## Data flow (Hype Reel)

```
submitHypeReelVideo(videoId, trackId?)
  → consent check (isConsentVerified) — else fail w/ Settings → Avatar hint
  → pick hero photo + 3 room photos from listing
  → script: { intro, outro, featureCallouts }
  → fire: generateVideo(intro,[hero])→introV2 ; generateVideo(outro,[hero])→outroV2 ;
          generateCinematicClip(accentPhoto)→accentJob   (≤1–2 accents)
  → write row: status=processing, heygen_video_id = reel:<introV2;outroV2;accentJob>
  → poll (UI 2.5s) + cron call assembleHypeReel:
       poll host(v2) + accent(v3) jobs; processing→wait; failed→fail
       self-lock processing→submitting
       build scenes: [host intro] + [3 room photo/accent scenes] + [host outro]
       compute beat grid → trim room scenes to beats
       build overlays from listing data + featureCallouts
       assembleMontage({ scenes, music, overlays, beatGrid }) → MP4
       upload video-cache (admin), signed URL (7d), row=completed
```

Cinematic flow is the same shape minus host/music/overlays, plus `narration` from TTS.

## ffmpeg design (core new work)

Single `ffmpeg` per video, one `filter_complex`:
- **Photo scenes:** `zoompan` Ken Burns over the real photo, scaled/padded to 720×1280, 30fps.
- **Cinematic/host scenes:** existing normalize/pad/fps; trim to target/beat duration.
- **Concat** all scene video streams in order.
- **Overlays:** `drawtext` chain over the montage window, beat-keyed fade in/out (bundled font).
- **Audio:**
  - Cinematic → single narration track (existing TTS) muxed, `-shortest`-style to montage length.
  - Hype Reel → music track full-length, volume automated **down ~-12dB** under host windows
    (host segments carry their own embedded synced voice), full during the montage; `amix`.
- Output: H.264 CRF 18 / medium, AAC 192k, `+faststart` (matches current stitch).

## Error handling
- Any sub-job `failed` → row `failed` + reason (mirror cinematic).
- `heygenFetch` non-200 during poll → caught; leave `processing` for next poll/cron.
- Stale `submitting` lock → cron resets to `processing`.
- Missing listing photos → fail early in submit with actionable message.
- No consent → fail early with the Settings → Avatar hint.

## Testing / verification
- Pure helpers (`kenburns.ts`, `beats.ts`, `overlay.ts`, scene/filter builders) side-effect-free
  for a future harness (per CLAUDE.md; no framework scaffolded now).
- `node scripts/verify-db.mjs` unaffected (no schema change).
- `HEYGEN_MOCK=1` end-to-end for **both** modes on a seeded listing: Ken Burns renders from real
  photos, sample accents/host MP4s, output lands in `video-cache`, row → `completed`.
- `npm run build` typecheck.

## Build order (for the implementation plan)
1. Shared primitive: `scenes.ts` + `kenburns.ts` + the montage assembler (with mock path).
2. Retrofit `assembleCinematicVideo` + `submitCinematicVideo` onto the primitive; verify cinematic
   is now faithful (real photos + accents) in mock.
3. Hype Reel: `beats.ts`, `overlay.ts`, `tracks.ts`, script variant, `assembleHypeReel`,
   `submitHypeReelVideo`, poll/cron routing, UI button + track picker.
4. Full mock E2E of both modes; build typecheck.

## Scope split
- **~60% reuse:** clip gen, presenter render, TTS, polling, cron, storage, consent, status
  transitions, mock flow, job-id encoding scheme.
- **~40% new:** the shared scene/montage assembler + Ken Burns motion (the faithfulness backbone),
  beat math, overlay builder, track library, script variant, Hype Reel submit/UI, and the cinematic
  retrofit wiring.

## Open / deferred
- **Deferred:** twin *rapping* (2nd singing voice clone + rap-tempo lip-sync) — separate R&D spike.
- **v1 defaults:** one library track; host over hero photo; 3 room shots; ≤1–2 cinematic accents
  per video. Accent ratio, track library, and shot count are the post-v1 levers.

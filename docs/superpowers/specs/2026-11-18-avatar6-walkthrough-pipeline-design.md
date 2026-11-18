# Avatar 6 walkthrough pipeline — scope

_2026-11-18 · status: proposed, nothing built yet_

Sources: HeyGen docs read on 2026-11-18 (`developers.heygen.com`: Avatar 6, Studio,
Webhooks, Webhook Events, Usage Limits, Endpoint Version Comparison, Cinematic Avatar,
changelog) and the current code in `lib/heygen`, `lib/video`, `app/(app)/videos/actions.ts`,
`app/api/cron/reconcile-videos`, `app/api/webhooks/heygen`.

**Nothing here has been run against a real HeyGen key.** Items marked _verify_ are
assumptions from the docs; the spike in §6 settles them before any build.

## 1. Why the current pipeline rarely finishes

One cinematic/hype video today is **4+ HeyGen jobs and ~5 ffmpeg passes**, sequenced by
whoever happens to call `pollVideoStatus`:

| # | Problem | Where |
|---|---|---|
| 1 | The browser drives the pipeline. A `setInterval` fires a **mutating** server action every 2.5s without waiting for the previous one; that action can run a multi-minute ffmpeg stitch. Close the tab and progress stops until the cron. | `components/videos/video-detail.tsx:127`, `actions.ts:797` |
| 2 | The lock is a status flip (`processing → submitting`) released by a 4-minute timeout. A killed function strands the row; overlapping polls race it. | `lib/video/assemble.ts` (`advanceLipsync`), `actions.ts:812` |
| 3 | Job state lives in a string (`heygen_video_id = "cine:a;b;c,d"`) plus read-modify-write on `script_segments` JSON. | `lib/video/cinematic.ts`, `hypereel.ts` |
| 4 | Voice is bolted on after the fact: silent Seedance clip → separate TTS → slice by **word count** → lipsync onto a generated face (which often has no detectable speaker) → trim → re-stitch. Every hop can drift or fail. | `lib/video/assemble.ts` |
| 5 | ffmpeg runs inside a Vercel function (300s cap, small `/tmp`, re-encodes each clip several times). | `lib/video/scenes.ts`, `stitch.ts` |
| 6 | The webhook is never used for these videos: clips are submitted without a callback, and the handler matches `heygen_video_id` exactly, which can't match a `cine:`/`reel:` row. | `app/api/webhooks/heygen/route.ts` |
| 7 | Finished videos store a 7-day signed URL in `videos.video_url`, so they stop playing after a week. | `lib/video/cinematic.ts`, `hypereel.ts` |
| 8 | **v1/v2 passed their sunset on 2026-10-31** and HeyGen says calls "may fail intermittently" during removal. Still on v1/v2: presenter render (`/v2/video/generate`), its status poll (`/v1/video_status.get`), voice clone (`/v2/voices/clone`), talking-photo upload, avatar list/delete. Presenter mode is living on borrowed time. | `lib/heygen/client.ts` |

Accuracy problem, separately: in cinematic mode the on-camera person and the rooms are both
**Seedance generations steered by a photo** — not the agent's real footage and not the real
room.

## 2. What HeyGen ships now that changes the design

- **Avatar 6** (`engine.type: "heygen-avatar-6"` or `-turbo` on `POST /v3/videos`,
  `type: "avatar"`). Takes the twin look + `script` + `voice_id` and returns a **natively
  lip-synced** clip, driven by the twin's own recorded footage (`engine.reference_look_id`),
  with `motion_prompt` for gestures. 1080p or 2k, 9:16 supported. Needs a consent-validated
  twin whose look lists the engine in `supported_api_engines`. **Not available** inside
  studio scenes, batches, raw-image requests, or scene editing.
- **Studio composition** (`type: "studio"` on `POST /v3/videos`): 1–50 ordered scenes →
  **one MP4 rendered by HeyGen**. Scene types: `avatar_video` (Avatar IV/V, with
  `remove_background` + image/video `background`), `image` (silent or narrated with
  `script`+`voice_id`), `video` (an existing clip, silent or narrated). Global captions
  (`caption`), `callback_url`, `callback_id`. This is the v3 replacement for the v2
  multi-scene render presenter mode uses.
- **Signed webhooks**: `POST /v3/webhooks/endpoints` returns a secret; deliveries carry a
  `signature` header (hex HMAC-SHA256 of the raw body), retry with backoff for 24h, need a
  2xx within 10s, and can be replayed from `GET /v3/webhooks/events`. Events include
  `avatar_video.success/fail` **and `instant_avatar.success/fail` for digital twins** — so
  twin training no longer needs polling either.
- `Idempotency-Key` on `POST /v3/videos`; `callback_id` (≤256 chars) echoed on the event.
- Limits: 10 concurrent jobs on pay-as-you-go; script ≤5,000 chars; inputs must be public
  URLs (video ≤100MB, image ≤50MB, under 2K).

## 3. Proposed pipeline

Principle: **HeyGen renders and composes; we only sequence.** No ffmpeg, no lipsync job,
no TTS slicing in the default path.

```
submit ──▶ Stage 1 (parallel)                 ──▶ Stage 2 (one job)            ──▶ done
           Avatar 6 opener  (twin talks,           studio composition:              re-host MP4
           Avatar 6 closer   real lip-sync)        [opener clip]                    in video-cache
                                                   [room scenes × N, real photos]
                                                   [closer clip]
```

- **Stage 1 — bookends on Avatar 6.** Two `type:"avatar"` jobs, `script` = opener/closer
  beat, `voice_id` = cloned voice, 9:16, 1080p, `motion_prompt` from the existing wardrobe/
  direction text. Voice and mouth come out of one model, so the padding/atempo/slice logic
  goes away.
- **Stage 2 — one studio job.** `video` scenes for the two bookend clips (silent mode =
  plays at its own length with its own audio); one scene per room photo in between. Room
  scene style is a product decision (§7): **(a)** `avatar_video` with the twin cut out over
  the **real photo** (Avatar V, `remove_background`), or **(b)** narrated `image` scene (real
  photo full-frame, cloned voice, no agent on screen). Captions via the global `caption`
  option instead of burn-in through lipsync.
- **Result:** 3 HeyGen jobs, 2 stages, 0 ffmpeg passes — versus 4+ jobs, 3 stages, ~5 passes.

Cinematic AI room remakes (Seedance) stay available as an opt-in b-roll style only; they
plug in as extra Stage 1 jobs feeding `video` scenes, same machinery.

### Orchestration

- **`video_jobs` table** (new migration, RLS owner-scoped, written by service role): one row
  per HeyGen job — `video_id`, `role` (`opener|closer|room:<n>|final`), `heygen_id`,
  `status`, `result_url`, `failure_code`, `error`, `attempts`. Replaces the `cine:`/`reel:`
  string and the lipsync keys in `script_segments`. Add `videos.stage` for UI progress.
- **One reducer, `advanceVideo(videoId)`** in `lib/video/pipeline.ts`: reads the job rows,
  decides the single next step (wait / submit stage 2 / finalize / fail), performs it with an
  `Idempotency-Key` derived from `videoId + role`, writes the result. Stage transitions are
  claimed with an atomic `update … where stage = <expected> returning`, so a duplicate
  webhook or a cron overlap is a no-op — no time-based lock.
- **Webhook is the driver.** `app/api/webhooks/heygen` verifies the `signature` HMAC over
  the raw body, de-dupes on `video_id + event_type`, updates the job row (found by
  `heygen_id`; `callback_id` = `<videoId>:<role>` as a cross-check), calls `advanceVideo`,
  returns 2xx. Every step is a short HTTP call, so it fits the 10s window.
- **Cron is only a safety net.** For videos in flight longer than a few minutes it fetches
  `GET /v3/videos/{id}` per pending job and calls the same reducer. Same code path, so the
  two can't disagree.
- **Browser only watches.** Supabase Realtime on the `videos` row (read-only poll as
  fallback). It never advances the job, so closing the tab changes nothing.
- **Finalize:** copy the finished MP4 + thumbnail into `video-cache`, store the **storage
  path**, and sign a fresh URL at view time (fixes the 7-day expiry).
- **Failure handling:** `failure_code` is stored per job; `generation_failed` retries that
  one job (up to 2 attempts) without re-rendering finished bookends; `moderation_rejected`
  fails fast with the message shown to the agent.

### v1/v2 cleanup riding along

Presenter mode moves to a single `type:"studio"` job (a strict subset of the above: Stage 2
only). Voice clone → `POST /v3/models/audio/voices`, status → `GET /v3/videos/{id}`,
avatar list/delete and talking photo → `/v3/avatars`. Twin training switches from
page-load polling to the `instant_avatar.*` webhook, with `reconcileAvatar` kept as backstop.

## 4. What gets deleted

`lib/video/assemble.ts` (lipsync/slice/pad state machine), `lib/heygen/lipsync.ts`,
`lib/video/cinematic.ts`, most of `hypereel.ts`, the three polling branches in
`pollVideoStatus`, the cinematic/reel passes in the cron, and the `ffmpeg-static` tracing
in `next.config.ts` once hype reel moves off it (below).

## 5. Milestones

| # | Scope | Outcome |
|---|---|---|
| 0 | Spike with a real key (§6). | Assumptions confirmed or the plan adjusted. |
| 1 | `video_jobs` + reducer + signed webhook + cron backstop + read-only client. Presenter mode on one studio job. v1/v2 calls migrated. | Reliability fixed; nothing left on sunset endpoints. |
| 2 | Avatar 6 bookends + studio composition as the default walkthrough. Engine eligibility + consent gate in the UI. | The accuracy upgrade. |
| 3 | Hype reel: music bed + Ken-Burns motion + overlays. Studio has no music track, so this needs either HeyGen **HyperFrames** (HTML composition rendered by HeyGen, own webhook) or one remaining ffmpeg audio-mix pass. Decide after M2. | ffmpeg fully removed, or reduced to one stream-copy mux. |

M1 and M2 are independent of M3; hype reel keeps its current path until M3.

## 6. Spike checklist (needs `HEYGEN_API_KEY`, spends a few credits)

1. `GET /v3/avatars/looks/{look_id}` on the real twin: does `supported_api_engines` list
   `heygen-avatar-6`? Is the group's `consent_status` `validated`?
2. Avatar 6 `type:"avatar"` at 9:16 with the cloned voice: quality, render time, and whether
   it accepts `remove_background` / `background` / `output_format:"webm"`. The Avatar 6 page
   doesn't list them. If it does, the bookends can stand in front of the real exterior photo;
   if not, the opener shows the twin's recorded backdrop.
3. Studio job mixing a `video` scene (the Avatar 6 clip by URL), an `avatar_video` scene with
   `remove_background` over a listing photo, and a narrated `image` scene, at 9:16. Check
   framing/padding and whether the twin look was trained with matting (required for the
   cutout; otherwise a 400).
4. Register a webhook endpoint against a preview deploy; confirm the `signature` header, the
   payload shape, and that `callback_id` round-trips for `avatar` and `studio` jobs.
5. Per-second cost of Avatar 6 vs Turbo vs Avatar V (pricing is behind the
   `platform.heygen.com` login — not visible from the docs).
6. Hit the current v2 presenter path once and log the `Deprecation`/`warning` response, to
   see how broken production already is.
7. Confirm `/v3/voices/speech` (current TTS) is still a live path; the docs now point at
   `POST /v3/models/audio/tts`.

## 7. Decisions needed

1. **Room scenes:** (a) twin cut out over the real photo, (b) narrated real photo with no
   agent on screen, or (c) keep AI room remakes as default. Recommendation: **(a)**, with (b)
   as automatic fallback when the look has no matting. (c) is the inaccurate one.
2. **Avatar 6 vs Turbo** for bookends — pick after seeing spike cost and render time.
3. **Hype reel compositor** (HyperFrames vs one ffmpeg mux) — defer to after M2.

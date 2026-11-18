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

**Decision (2026-11-18): the walkthrough is AI video of the agent walking through the home
reciting the script.** That is HeyGen's **Cinematic Avatar**, not Avatar 6 — Avatar 6
animates a talking presenter from the twin's footage and cannot walk a scene.

What makes this workable now: Cinematic Avatar on the **HeyGen Video model**
(`type:"cinematic_avatar"`, `model:"heygen_video_1"`) casts the twin look **and its linked
voice**, and speaks any line written in quotes in the prompt, with audio generated in the
same pass. The docs state there is "no separate speech pass, lip-sync step". So the
TTS → slice → lipsync chain (§1 #4) is replaced by putting the line in the prompt.

Principle: **HeyGen renders and composes; we only sequence.** No ffmpeg, no lipsync job,
no TTS slicing in the default path.

```
submit ──▶ Stage 1 (parallel, queued)             ──▶ Stage 2 (one job)      ──▶ done
           walking+talking clip per room beat          studio composition:        re-host MP4
           Avatar 6 opener + closer (real footage)      clips in order             in video-cache
```

- **Stage 1 — one clip per script beat.** Each is a `cinematic_avatar` job on
  `heygen_video_1`, 9:16, with the room's real photo(s) as `references` (up to 9 images, so
  several angles of one room can go in) and a prompt that describes the walk and contains
  the beat as a quoted line. Constraints from the docs: **5–15s per clip, 720p**, dialogue
  paces at ~2.5 words/sec, so **a beat is capped at ~35 words**; the script generator must
  plan beats to that budget (it already plans per-room word counts).
- **Stage 2 — one studio job.** A `video` scene per clip in silent mode (plays at its own
  length with its own audio) → one MP4.
- **Queueing.** Pay-as-you-go allows 10 concurrent jobs. An 8-room tour is 10 clips, so the
  reducer submits in waves and tops up as webhooks arrive, instead of firing everything.
- **Per-clip retry.** A failed or misspoken clip re-renders alone; finished clips are kept.

Known limits to be honest about:

- **Rooms are AI recreations steered by the photos, not the real rooms.** The existing
  in-UI disclosure stays. Presenter mode remains the faithful option.
- **720p** on HeyGen Video. Seedance 2 does 1080p but is what we use today, silent.
- **Captions:** studio captions are derived from avatar/narrated scenes, not from `video`
  scenes, so burned-in captions need another route (_verify_; we do have the script text
  and can supply an SRT-based approach later).
- **Cinematic Avatar rejects `callback_url`** (400). Completion comes only through the
  registered webhook endpoint, matched on the HeyGen video id.
- **Bookends move to Avatar 6 (decided 2026-11-18).** User feedback: the current opener and
  closer look fake — AI-generated body movement. They are Seedance generations with the
  voice lip-synced on afterwards. Avatar 6 instead animates the twin from the **agent's own
  recorded footage** (`engine.reference_look_id`), lip-synced natively, so gestures and
  posture are the agent's real ones. Use `motion_expressiveness: "less"` and a restrained
  `motion_prompt`. Trade-off (_verify_): unless Avatar 6 accepts background removal, the
  bookends show the agent in their recorded setting, not in front of the house.
- **The same risk applies to the room clips.** Walking shots come from the same family of
  generative model as today's bookends, so they may show the same fake movement. Spike item
  1 judges this on real output before M2 is built. If they don't pass, the fallback is real
  photos with the agent's voice-over between Avatar 6 bookends.

### Orchestration

- **`video_jobs` table** (new migration, RLS owner-scoped, written by service role): one row
  per HeyGen job — `video_id`, `role` (`opener|room:<n>|closer|final`), `heygen_id`,
  `status`, `result_url`, `failure_code`, `error`, `attempts`. Replaces the `cine:`/`reel:`
  string and the lipsync keys in `script_segments`. Add `videos.stage` for UI progress.
- **One reducer, `advanceVideo(videoId)`** in `lib/video/pipeline.ts`: reads the job rows,
  decides the single next step (wait / submit stage 2 / finalize / fail), performs it with an
  `Idempotency-Key` derived from `videoId + role`, writes the result. Stage transitions are
  claimed with an atomic `update … where stage = <expected> returning`, so a duplicate
  webhook or a cron overlap is a no-op — no time-based lock.
- **Webhook is the driver.** `app/api/webhooks/heygen` verifies the `signature` HMAC over
  the raw body, de-dupes on `video_id + event_type`, updates the job row (found by
  `heygen_id`; cinematic jobs accept no callback fields), calls `advanceVideo`,
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
| 1 | `video_jobs` + reducer + job queue + signed webhook + cron backstop + read-only client. Presenter mode on one studio job. v1/v2 calls migrated. | Reliability fixed; nothing left on sunset endpoints. |
| 2 | Walking+talking clips on Cinematic Avatar / HeyGen Video, composed by one studio job. Beat planning to the ~35-word cap. Consent gate (already exists). | The new default walkthrough. |
| 3 | Hype reel music bed and overlays, captions on walking clips. Studio has no music track, so this needs HeyGen **HyperFrames** (HTML composition rendered by HeyGen) or one remaining ffmpeg audio-mix pass. | ffmpeg removed, or reduced to one stream-copy mux. |

## 6. Spike checklist (needs `HEYGEN_API_KEY`, spends a few credits)

1. **Does the twin recite the line verbatim, in the cloned voice?** One `cinematic_avatar`
   clip on `heygen_video_1` with a real room photo and a ~25-word quoted line. Check words,
   voice match (is the cloned voice "linked" to the look, or does it need linking?), lip
   sync, likeness, and how faithful the room is. This is the make-or-break test.
2. Voice and look consistency **across** three consecutive clips (pace, tone, wardrobe).
3. Same shot on Seedance 2 at 1080p for comparison (speech support there is unclear).
4. If recital is unreliable: fallback of generating the walk silent and running
   `POST /v3/lipsyncs` per clip (what we do today, but driven by the new reducer).
5. Studio job concatenating three such clips as silent `video` scenes at 9:16: framing,
   audio continuity at the seams, and whether `caption` produces anything.
6. Register a webhook endpoint against a preview deploy; confirm the `signature` header and
   that `avatar_video.success` fires for cinematic and studio jobs.
7. Avatar 6 direct-to-camera opener: `supported_api_engines` on the twin look, quality, and
   whether it accepts `remove_background`/`background`.
8. Cost per clip-second for HeyGen Video vs Seedance 2 vs Avatar 6 (pricing is behind the
   `platform.heygen.com` login).
9. Hit the current v2 presenter path once and log the `Deprecation`/`warning` response.
10. Confirm `/v3/voices/speech` (current TTS) is still live; docs now point at
    `POST /v3/models/audio/tts`.

## 7. Decisions

1. **Room scenes — decided:** AI video of the agent walking through the home reciting the
   script (Cinematic Avatar).
2. **Model** (HeyGen Video 720p with native speech vs Seedance 2 1080p + lipsync) — after
   spike items 1–4.
3. **Bookends — decided:** Avatar 6 from the agent's real footage, replacing the generated
   bookends.
4. **Hype reel compositor / captions** — defer to M3.

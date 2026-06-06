# HeyGen integration

HeyGen powers two things: creating a talking **avatar** from the agent's photo, and generating
the **walkthrough video** (avatar narrating a script over listing photos).

> ⚠️ **Verification caveat.** HeyGen is mid-migration (v2 endpoints supported through Oct 31
> 2026; v3 is the active platform). The endpoints below were verified against HeyGen's docs and
> community references, but the request/response shapes can shift between versions and the
> reference is partly gated behind an interactive playground. **Before a high-stakes (investor)
> demo, hit each endpoint once with a real key to confirm.** Every endpoint string is isolated in
> [`lib/heygen/client.ts`](../lib/heygen/client.ts) so any fix is a one-file change.

## The demo flow (image → avatar, audio → voice)

This is the live flow used for the investor demo — no MLS, no seed data needed:

1. **Photo → avatar.** The agent uploads a photo; we create a **talking photo**
   (`POST https://upload.heygen.com/v1/talking_photo`, raw image bytes) and get a
   `talking_photo_id`, usable in video generation immediately.
2. **Voice clip → voice (optional).** If the agent uploads a short audio clip, we upload it and
   request an **instant voice clone** (`/v2/voices/clone`) to get a `voice_id`. If they skip it
   (or cloning fails), we fall back to `HEYGEN_DEFAULT_VOICE_ID` / a stock voice — a video always
   renders.
3. **Listing → script → video.** The AI-written script is sent to
   `POST /v2/video/generate` with `character.type: "talking_photo"` and
   `voice.{type:"text", input_text: script, voice_id}` so the avatar speaks the script in the
   agent's (cloned) voice, over the listing's photos as background.

To run this for real: set `HEYGEN_MOCK=0` + `HEYGEN_API_KEY` (and optionally
`HEYGEN_DEFAULT_VOICE_ID`). Code path: [`lib/heygen/avatar.ts`](../lib/heygen/avatar.ts)
(`createAvatarFromAsset`, `cloneVoiceFromAudio`) and [`lib/heygen/video.ts`](../lib/heygen/video.ts).

---

## Mock mode (default)

`HEYGEN_MOCK=1` (or simply leaving `HEYGEN_API_KEY` empty) makes the client return stable fake
ids, an instant `ready` avatar, and a sample MP4 as the "generated" video. Combined with the
poll loop (which simulates a ~6s processing window), the **entire avatar → video flow runs with
no external calls**. This is how the bundled `scripts/e2e.mjs` verifies the full path.

To go live: set `HEYGEN_MOCK=0` and `HEYGEN_API_KEY`, then verify the endpoints below.

---

## Authentication

- Header: `X-Api-Key: <key>` on every request. Key from the HeyGen dashboard (Settings → API).
- Base URL: `https://api.heygen.com`.
- Self-serve is pay-as-you-go (API credits); enterprise tier adds SSO/SCIM and higher concurrency.

## Avatar creation (`lib/heygen/avatar.ts`)

The app uses a **talking photo**: upload one image → get a `talking_photo_id` that's usable in
video generation immediately (no training wait, no manual studio step). It's stored on
`avatars.heygen_avatar_id`. (HeyGen's newer **Avatar IV** photo-avatar path is an alternative —
swap the upload/create calls in `avatar.ts` if you prefer it.)

Voice is either a HeyGen **stock voice** (`GET /v2/voices`, default `HEYGEN_DEFAULT_VOICE_ID`) or a
**cloned voice** of the agent from an uploaded audio clip (`/v2/voices/clone`), stored as
`avatars.voice_id`. Cloning is best-effort with a stock-voice fallback so generation never blocks.

## Video generation (`lib/heygen/video.ts`)

Submit `{ avatar_id, script, voice_id?, background image }` to the generate endpoint → returns a
`video_id` immediately (async). Completion arrives via:

- **Webhook** — pass a `callback_url`; HeyGen POSTs `avatar_video.success` / `avatar_video.fail`.
  Handled at [`app/api/webhooks/heygen`](../app/api/webhooks/heygen/route.ts).
- **Polling** — `GET` the video status endpoint; used as the fallback/reconciler and to drive the
  live UI in mock mode.

### Compositing avatar over listing photos

Two options for showing the property behind/around the avatar:
- **Per-request background** — pass a background image URL on the video input (what the current
  client does: first listing photo as background).
- **Template API** — design a reusable real-estate template in HeyGen Studio with placeholders
  (avatar character, background image, text) and pass variables per video. This is the cleaner
  path for multi-photo, branded layouts; wire it into `video.ts` when you build out templates.

## Endpoints (pin these against live docs)

All defined in [`lib/heygen/client.ts`](../lib/heygen/client.ts) `ENDPOINTS`:

| Purpose | Current value (verify) |
|---|---|
| Upload talking photo (image → avatar) | `https://upload.heygen.com/v1/talking_photo` |
| Upload asset (audio/other) | `https://upload.heygen.com/v1/asset` |
| Clone voice (audio → voice_id) | `/v2/voices/clone` |
| List voices | `/v2/voices` |
| Generate video | `/v2/video/generate` |
| Video status | `/v1/video_status.get?video_id={id}` |

Before disabling mock mode, hit each endpoint once with a real key to confirm the path and the
request/response shape, and decide v2 vs v3.

## Pricing & limits (high level, 2025–2026)

- Avatar IV (photo) video ≈ $4/min at 1080p; ~1 USD credit ≈ 1 min of standard video.
- Up to ~10 concurrent generation jobs on self-serve; enterprise raises this.
- Purchased credits expire ~12 months from purchase.

Add usage guards (per-agent generation caps) before opening this to many users — see
[production.md](./production.md).

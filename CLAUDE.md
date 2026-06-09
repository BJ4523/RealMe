# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## ⚠️ Next.js 16 — read the bundled docs first

This repo runs **Next.js 16**, which has breaking changes from earlier versions (APIs, conventions, file structure). Before writing Next.js code, read the relevant guide in `node_modules/next/dist/docs/` and heed deprecation notices. See `AGENTS.md`. The most visible consequence: **Middleware is renamed "Proxy"** — session refresh lives in `proxy.ts` (exporting `proxy()`), not `middleware.ts`.

## Commands

```bash
npm run dev          # dev server → http://localhost:3000
npm run build        # production build (also the fastest full typecheck)
npm run lint         # eslint (eslint-config-next)
npx tsc --noEmit     # typecheck only

supabase start       # local stack (Docker) on ports 544xx; applies migrations, prints keys
supabase db push     # push migrations to the linked cloud project
supabase migration new <name>   # always create migration files this way
```

There is **no unit-test runner** (no vitest/jest). Verification is done with the scripts in `scripts/`:

```bash
node scripts/verify-db.mjs                               # signup trigger + RLS isolation vs local Supabase
BASE_URL=http://localhost:3000 node scripts/e2e.mjs      # Playwright click-through of the full flow
```

When adding a pure, testable helper (e.g. `lib/audio/wav.ts`), keep it side-effect-free so a test harness can be added later; don't scaffold a test framework unless asked.

## Big picture

RealMe turns a real-estate agent into an on-camera AI presenter: photo + voice → HeyGen **avatar**; a **listing** (manual / paste-a-URL / future MLS) → Claude-written script → HeyGen **walkthrough video**. Stack: Next.js 16 App Router (TS) · Supabase (auth + Postgres + Storage) · HeyGen · Anthropic · Tailwind/shadcn · Vercel.

**Mock-first.** With `HEYGEN_MOCK=1` (default) the whole signup→avatar→listing→script→video flow runs with no external keys (fake ids + a sample MP4). `lib/env.ts` deliberately **does not throw at import time**; server features that need a real key call `requireEnv()` at runtime. `isMock` in `lib/heygen/client.ts` is also true whenever `HEYGEN_API_KEY` is empty.

### Two coexisting UI systems (important)

1. **Ported design** (`components/site/**`, marked `@ts-nocheck`) renders the polished product surfaces: marketing `/` (`app/(marketing)`), the dashboard `/app` (`app/app`), and the consumer site `/live` (`app/live`). Typed data crosses the boundary via React context (`components/site/dashboard/data-context.tsx`) and server actions in `lib/site/`.
2. **Legacy functional routes** under the `app/(app)` group — `/onboarding`, `/dashboard`, `/listings`, `/videos`, `/settings` — typed Tailwind/shadcn pages where the original avatar/listing/video CRUD and their `actions.ts` live. Some are still used (avatar setup, listing CRUD); others are superseded by `/app`.

Before changing a feature, confirm which system the user means — the same concept (e.g. "the dashboard") exists in both. Newer work targets the design surfaces.

### Auth & data access

- Three Supabase clients in `lib/supabase/`: `server.ts` (RSC / actions / route handlers, cookie-based), `client.ts` (browser), and `admin.ts` (**service-role, bypasses RLS — webhooks/cron only, never import into client code**).
- `proxy.ts` → `lib/supabase/middleware.ts:updateSession` refreshes the session on every request.
- **RLS is enabled on every table** with owner-scoped policies keyed on `auth.uid()` (see `supabase/migrations/`). A `handle_new_user` trigger auto-creates the `profiles` row on signup — there is intentionally **no INSERT policy** on `profiles`.
- Tables: `profiles` (1:1 with `auth.users`), `avatars`, `mls_connections`, `listings`, `videos`. Private Storage buckets `avatar-sources`, `listing-photos`, `video-cache` use owner-prefixed paths (`<uid>/...`).
- **Auth callback routes:** the in-app magic-link flow is **PKCE** via `/auth/callback` (`exchangeCodeForSession`). `/auth/confirm` handles `token_hash`+`type` via `verifyOtp` — use this for admin-generated/seeded login links (PKCE has no browser verifier for those).

### Integration layers (depend on the interface, not the concrete impl)

- **HeyGen** (`lib/heygen/`): **every endpoint string lives in `client.ts`** — the single place to verify/pin against live docs when going off-mock (HeyGen is mid v2→v3 migration). `avatar.ts` (digital-twin + talking-photo + instant voice clone), `video.ts` (generate/status). `heygenFetch` **throws on any non-200**, so callers that hit it inside a poll (`pollVideoStatus`) will 500 if HeyGen errors on a lookup. Recorded voice clips are re-encoded to mono WAV (`lib/audio/wav.ts`) because HeyGen's clone rejects browser webm/opus.
- **Avatar = Digital Twin** (one per user; creating a new one replaces the old): the agent records/uploads a 15–600s video → HeyGen v3 `digital_twin`. **HeyGen never webhooks on twin training**, so a failed twin (e.g. "Footage is too short or too long") would otherwise sit on `processing` forever and silently block video generation. `lib/avatars/reconcile.ts` (`reconcileAvatar`) polls the look's real status and patches the row to `ready`/`failed` (+reason); it runs on the `/settings/avatar` page load and in the video cron. That page also **views** the twin (signed URL to the `avatar-sources` clip) and **replaces** it. The uploader (`components/avatar/avatar-uploader.tsx`) **compresses big clips client-side** via `ffmpeg.wasm` (single-thread core self-hosted in `public/ffmpeg/`, no cross-origin-isolation headers; `lib/video/compress.ts`) to fit the 50MiB bucket, and **guards duration 15–600s** before upload.
- **Listings** (`lib/listings/`): `ListingProvider` interface with `manual`, `url_scrape`, and a `simplyrets` stub, registered in `index.ts`. UI/API depend only on the interface; add MLS aggregators (RESO/MLS Grid) without UI changes. Agent-level filtering uses RESO `ListAgentMlsId` stored on `profiles.mls_agent_id`.
- **Script** (`lib/ai/script.ts`): Claude `messages.parse()` with a Zod schema; templated fallback when `ANTHROPIC_API_KEY` is unset.

### Async video job loop

Generate → `processing` → `completed`, driven by **either** the HeyGen webhook (`app/api/webhooks/heygen`, shared-secret query param) **or** the daily cron reconciler (`app/api/cron/reconcile-videos`, scheduled in `vercel.json`, guarded by `CRON_SECRET`) for jobs that miss their webhook. The same cron also reconciles stuck **avatars** (twin training sends no webhook) and assembles **cinematic** videos. A video stuck in `processing` is unstuck by hitting that endpoint with the prod `CRON_SECRET` (the value is encrypted in Vercel — trigger from the Vercel dashboard's Cron tab, not from the repo).

### Two video modes (`app/(app)/videos/actions.ts`)

1. **Presenter** (default, `submitVideo`): HeyGen v2 `/video/generate` — the twin as a matted, background-removed presenter over the **real listing photos**, narrating in the cloned voice. Faithful to the property.
2. **Cinematic** (`submitCinematicVideo`, opt-in, gated on a **consent-verified** twin): one HeyGen **Cinematic Avatar / Seedance** clip per photo (`lib/heygen/cinematic.ts`, `POST /v3/videos` `type:"cinematic_avatar"`, ≤15s each) → server-side **stitch + cloned-voice narration mux** via a bundled static ffmpeg (`lib/video/stitch.ts`, `ffmpeg-static` — traced into the function in `next.config.ts`) → uploaded to `video-cache`. Job state is encoded migration-free in `videos.heygen_video_id` as `cine:<jobId,jobId,…>`; assembly (`lib/video/cinematic.ts`, `assembleCinematicVideo`) runs from the poll **and** the cron, self-locking via `processing→submitting`. **Consent**: cinematic requires `consent_status: validated` on the twin group — cleared via HeyGen's hosted flow (`startTwinConsent` → recorder URL, shown on `/settings/avatar`). **Caveat:** cinematic scenes are AI-generated approximations steered by the photos, *not* the real rooms — surfaced as an in-UI disclosure; keep presenter mode for faithful tours. Narration uses standalone TTS (`lib/heygen/voice.ts`, `/v1/audio/text_to_speech`).

## Environment & cloud resources

- Env vars are centralized in `lib/env.ts`; full list with comments in `.env.example`. **`.env*` is gitignored** (including `.env.example`) — keep secrets out of commits.
- Cloud Supabase project: **`srigrlqyzpfjuahmqdag`** ("BJ4523's Project"). This account has other unrelated production projects (e.g. sober-friend, Case Management App, Loom) — **verify the project ref before any `supabase ... --linked` / config push.**
- Local Supabase ports are remapped to `544xx` (see `supabase/config.toml`) to avoid clashing with other local projects.
- Going-live steps and the design/feature status are in `docs/production.md` and `PRD_STATUS.md`. Deeper docs: `docs/architecture.md`, `docs/heygen.md`, `docs/mls-listings.md`, `docs/setup.md`.

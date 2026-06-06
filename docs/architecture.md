# Architecture

## Product flow

```
sign up ─▶ create avatar ─▶ add/import listing ─▶ generate script ─▶ generate video ─▶ download / share
          (HeyGen)          (manual or URL)        (Claude)           (HeyGen, async)
```

A real estate agent uploads one photo to create a talking avatar, adds a property listing,
and the app auto-writes a 60–90s narration script from the listing details and renders a
video where the avatar walks the viewer through the property over its photos.

## Stack

- **Next.js 16** (App Router, TypeScript, Turbopack). Note: Next 16 renamed Middleware to
  **Proxy** — session refresh lives in `proxy.ts` at the repo root.
- **Supabase** — Postgres, Auth, Storage, Row Level Security. Local stack via the Supabase CLI.
- **HeyGen** — avatar creation + video generation (`lib/heygen/`).
- **Anthropic (Claude)** — narration script generation (`lib/ai/script.ts`).
- **Tailwind v4 + shadcn/ui** — design system (cream `#F2EEE5`, neon-lime `#D6FF3D`, ink
  `#111110`; Bricolage Grotesque / Geist / JetBrains Mono).
- **Vercel** — hosting, serverless functions, cron.

## Directory map

```
app/
  (marketing)/        public landing
  (auth)/             login, signup, auth/confirm + auth/callback route handlers, server actions
  (app)/              authenticated shell (sidebar + mobile tab bar)
    onboarding/       avatar creation wizard
    dashboard/        counts + recent videos
    listings/         list · new (manual + URL import) · [id] detail
    videos/           library · [id] (script editor → player)
    settings/         profile · avatar · connections
  api/
    webhooks/heygen/  video completion callback (service-role)
    listings/scrape/  paste-URL → parsed draft
    cron/reconcile-videos/  self-heal stuck jobs
    health/
lib/
  supabase/           server, client, middleware (proxy helper), admin (service-role)
  heygen/             client (all endpoint strings) · avatar · video · types
  listings/           provider interface + manual / url_scrape / simplyrets (stub) + factory
  ai/                 script.ts (Claude + templated fallback)
  auth.ts             requireUser / requireOnboarded
  format.ts, env.ts, utils.ts, types/database.ts
supabase/migrations/  schema + RLS + storage policies + handle_new_user trigger
proxy.ts              session refresh + optimistic auth redirect
vercel.json           cron schedule for the reconciler
```

## Data model

All tables live in `public`, **RLS enabled on every one**, owned by `auth.users`.

| Table | Purpose | Key columns |
|---|---|---|
| `profiles` | 1:1 with `auth.users`, created by trigger | `full_name`, `brokerage`, `mls_agent_id` (RESO `ListAgentMlsId`), `onboarding_completed` |
| `avatars` | agent's HeyGen avatars | `heygen_avatar_id`, `voice_id`, `source_path`, `status`, `is_active` |
| `mls_connections` | chosen listing provider | `provider`, `status`, `credentials` |
| `listings` | properties | address/price/beds/baths/sqft, `description`, `features[]`, `photos jsonb`, `source`, `external_id` |
| `videos` | the async job + result | `listing_id`, `avatar_id`, `script`, `heygen_video_id`, `status`, `video_url`, `thumbnail_url`, `duration` |

### RLS pattern

Every table uses owner-scoped policies keyed on `auth.uid()` (profiles on `id`, others on
`user_id`). UPDATE policies carry **both** `USING` and `WITH CHECK` so a row's owner can't be
reassigned. The webhook and cron run with no user session, so they use the **service-role
client** (`lib/supabase/admin.ts`), which bypasses RLS — that key is never exposed to the browser.

The `handle_new_user()` trigger (SECURITY DEFINER, empty `search_path`) inserts the `profiles`
row on signup. Verified by `scripts/verify-db.mjs` (trigger + cross-user isolation).

## Auth + session

- `lib/supabase/server.ts` — `createServerClient` reading Next's async `cookies()`; used in
  Server Components, Server Actions, and route handlers.
- `lib/supabase/client.ts` — `createBrowserClient` for client components.
- `proxy.ts` → `lib/supabase/middleware.ts:updateSession` — the single place that calls
  `auth.getUser()` (verifies the JWT) and refreshes the cookie on every request; also does an
  optimistic redirect to `/login` for unauthenticated hits on app routes.
- Trust decisions always use `getUser()`, never `getSession()`.
- The `(app)` layout enforces auth; `requireOnboarded()` gates the core pages until the agent
  has created an avatar. RLS is the real security boundary; these checks are UX.

## Integration layers

### Listing providers (`lib/listings/`)

A `ListingProvider` interface (`fetchListings`, `fetchOne`, `normalize`) makes the listing
source swappable. The UI and API depend only on the interface; concrete providers are resolved
by `getListingProvider(id)`. See [mls-listings.md](./mls-listings.md).

### HeyGen client (`lib/heygen/`)

`client.ts` holds the base URL, `X-Api-Key` auth, and **every endpoint string** in one
`ENDPOINTS` map — the only place to verify against live docs. `isMock` (driven by
`HEYGEN_MOCK` / missing key) short-circuits to fake-but-stable ids and a sample video. See
[heygen.md](./heygen.md).

### Script generation (`lib/ai/script.ts`)

`generateWalkthroughScript(listing)` calls Claude via `messages.parse()` with a Zod schema
`{ narration, segments:[{photoOrder, line}] }`, mapping narration lines to listing photos. Falls
back to a deterministic templated script when `ANTHROPIC_API_KEY` is unset, so the flow always
completes.

## Async video job loop

`videos.status`: `pending_script → script_ready → submitting → processing → completed | failed`.

1. **Generate** (server action `generateForListing`) — insert a `videos` row, run the script
   generator, store the script, set `script_ready`. Redirect to `/videos/[id]`.
2. **Submit** (server action `submitVideo`) — set `submitting`, call HeyGen `generateVideo` with
   a webhook callback URL, store `heygen_video_id`, set `processing`.
3. **Complete** — two independent paths so it's resilient:
   - **Webhook** `app/api/webhooks/heygen` (real HeyGen) — service-role, secret-verified, finds
     the row by `heygen_video_id`, sets `completed` + `video_url`.
   - **Poll / cron** — `pollVideoStatus` (driven by the video page client) and the
     `/api/cron/reconcile-videos` cron self-heal any job that misses its webhook. In mock mode
     the poll simulates a ~6s processing window before completing — no webhook needed.

This is why the loop works end-to-end with zero external services in mock mode, and why a
dropped webhook in production can't strand a job.

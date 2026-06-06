# Real Me

AI walkthrough videos for real estate agents. An agent signs up, creates a talking
avatar of themselves (HeyGen), adds a listing (manual entry or paste-a-URL), and the app
auto-writes a narration script (Claude) and generates a video where the avatar walks the
viewer through the property. Built with **Next.js 16 (App Router) · Supabase · HeyGen ·
Anthropic · Tailwind + shadcn/ui**, deployable on **Vercel**.

> **Mock-first:** with `HEYGEN_MOCK=1` (the default) the entire signup → avatar → listing →
> script → video flow runs end-to-end with no external API keys. Plug real keys in later.

## Documentation

Full docs in [`docs/`](./docs/README.md):

- [Architecture](./docs/architecture.md) — system design, data model + RLS, integration layers, the async video loop
- [MLS listings](./docs/mls-listings.md) — **how agents get their listings** (RESO, aggregators, agent-level filtering, costs, the recommended path)
- [HeyGen](./docs/heygen.md) — avatar/video API, mock mode, and the endpoint-verification caveat
- [Setup](./docs/setup.md) — local dev, env vars, ports, verification scripts
- [Production](./docs/production.md) — going-live checklist

## Quick start

```bash
# 1. Local Supabase (Docker required) — applies the migration, prints keys
supabase start

# 2. Copy env and fill in the Supabase values printed above
cp .env.example .env.local   # already populated for local dev in this repo

# 3. Run
npm install
npm run dev                  # http://localhost:3000
```

`.env.local` is pre-filled for the local Supabase stack (ports remapped to `544xx` to avoid
clashing with other projects — see `supabase/config.toml`).

## How it works

| Concern | Where |
|---|---|
| Auth + session | `@supabase/ssr` clients in `lib/supabase/*`; session refresh in `proxy.ts` (Next 16's renamed Middleware) |
| Data model + RLS | `supabase/migrations/*` — owner-scoped policies on every table, `handle_new_user` trigger creates the profile |
| Listing sources | `lib/listings/` — `ListingProvider` interface with `manual`, `url_scrape`, and a `simplyrets` stub; swap in MLS aggregators without UI changes |
| Avatar + video | `lib/heygen/` — **all endpoint strings live in `client.ts`**; honors `HEYGEN_MOCK` |
| Script generation | `lib/ai/script.ts` — Claude `messages.parse()` with a Zod schema; templated fallback when no key |
| Async job loop | submit → `processing` → `completed`, driven by the webhook (`app/api/webhooks/heygen`) or the poll/cron reconciler (`app/api/cron/reconcile-videos`) |

## Going to production

1. **HeyGen:** set `HEYGEN_MOCK=0` + `HEYGEN_API_KEY`. Verify the endpoint paths/shapes in
   `lib/heygen/client.ts` against the live docs (HeyGen is mid v2→v3 migration).
2. **Claude:** set `ANTHROPIC_API_KEY` for real script generation.
3. **MLS listings:** implement a concrete `ListingProvider` (SimplyRETS is the fastest path —
   the agent brings their own MLS credentials; filter to their listings via the RESO
   `ListAgentMlsId` field stored on the profile) and register it in `lib/listings/index.ts`.
4. **Supabase cloud:** point env at a cloud project; push migrations with `supabase db push`.
5. **Vercel:** set the env vars (incl. `NEXT_PUBLIC_SITE_URL` so the HeyGen webhook callback
   resolves). The `vercel.json` cron reconciles any jobs that miss their webhook.

## Verification scripts

- `node scripts/verify-db.mjs` — signup trigger + RLS isolation against local Supabase.
- `BASE_URL=http://localhost:3000 node scripts/e2e.mjs` — Playwright click-through of the full
  flow (signup → avatar → listing → script → generated video).

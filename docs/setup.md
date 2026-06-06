# Local setup

## Prerequisites

- Node 20+ and npm
- Docker (for the local Supabase stack)
- Supabase CLI (`supabase --version`)

## Run it

```bash
# 1. Start the local Supabase stack (applies migrations, prints keys)
supabase start

# 2. Install deps and run
npm install
npm run dev          # serves on http://localhost:3000 (or the next free port)
```

`.env.local` in this repo is already populated for the local stack, so no manual key copying is
needed for local development. With `HEYGEN_MOCK=1` the full flow works without any external keys.

> **Port note:** this project's Supabase ports are remapped to the `544xx` range
> (`supabase/config.toml`) so they don't collide with other local Supabase projects. The local
> API is at `http://127.0.0.1:54421`, Studio at `http://127.0.0.1:54423`. If port 3000 is taken,
> Next picks the next free port and prints it.

## Environment variables

See [`.env.example`](../.env.example). Summary:

| Var | Scope | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | public | Local: `http://127.0.0.1:54421` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | public | Browser-safe publishable/anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | server | Bypasses RLS — webhook/cron only. Never `NEXT_PUBLIC_`. |
| `HEYGEN_MOCK` | server | `1` (default) runs the flow without HeyGen |
| `HEYGEN_API_KEY` | server | Required only when `HEYGEN_MOCK=0` |
| `HEYGEN_WEBHOOK_SECRET` | server | Verifies the HeyGen completion callback |
| `ANTHROPIC_API_KEY` | server | Optional; templated script used when unset |
| `NEXT_PUBLIC_SITE_URL` | public | Builds the webhook callback + share links |
| `CRON_SECRET` | server | Protects `/api/cron/reconcile-videos` |

`lib/env.ts` validates/centralizes these and never throws at import (so the app builds in
mock-first mode); server features that truly need a key call `requireEnv()` at runtime.

## Database workflow

- Schema lives in `supabase/migrations/`. Iterate with `supabase db reset` (re-applies all
  migrations to the local DB).
- Regenerate types after a schema change: `supabase gen types typescript --local > lib/types/database.ts`.
- Run security advisors: `supabase db advisors --type security` (should report no issues).

## Verification scripts

- **DB / RLS** — `node scripts/verify-db.mjs`
  Confirms the `handle_new_user` trigger creates a profile on signup and that RLS isolates one
  user's listings from another (including the `WITH CHECK` spoof guard). 9 checks.

- **Full flow (browser)** — `BASE_URL=http://localhost:3000 node scripts/e2e.mjs`
  Playwright click-through: signup → avatar upload → add listing → generate script → generate
  video → completed player. Needs the dev server running and `npx playwright install chromium`
  once. Writes a screenshot to `/tmp/realme-completed.png`.

## Common commands

```bash
npm run dev        # dev server (Turbopack)
npm run build      # production build (also runs tsc)
npm run lint       # ESLint
npx tsc --noEmit   # typecheck only
supabase status    # local stack URLs + keys
supabase stop      # stop the local stack
```

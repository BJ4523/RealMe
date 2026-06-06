# Real Me — Documentation

Project docs for the AI walkthrough-video app for real estate agents.

| Doc | What's in it |
|---|---|
| [architecture.md](./architecture.md) | System design, data model + RLS, the integration layers, and the async video job loop |
| [mls-listings.md](./mls-listings.md) | **How agents get their listings** — RESO Web API, aggregators, agent-level filtering, costs, timelines, and the recommended path |
| [heygen.md](./heygen.md) | HeyGen API research — avatar creation, video generation, voices, templates, pricing, webhooks, and the mock-mode strategy |
| [setup.md](./setup.md) | Local development: prerequisites, Supabase ports, env vars, and verification scripts |
| [production.md](./production.md) | Going-to-production checklist: switching off mocks, wiring real keys, deploying to Vercel |

Start with [setup.md](./setup.md) to run it locally, then [architecture.md](./architecture.md)
to understand how the pieces fit.

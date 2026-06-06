# Getting agents' listings

The core data question: when an agent signs up, how do we dynamically and accurately pull
**their own** active listings (address, price, beds/baths, sqft, photos, description, status)?

**Short answer:** there is no single public consumer API — Zillow's public API shut down in
2021, and Realtor.com / Redfin are closed. The accurate, dynamic source is the **RESO Web API**
(the MLS industry standard), accessed either directly per-MLS or through an aggregator that
resells many MLSs under one contract. Agent-level filtering is done with the RESO
**`ListAgentMlsId`** field. For an MVP, start with **manual entry + URL import** (shipped) and
**SimplyRETS** (agent brings their own MLS credentials), then graduate to a national aggregator.

This is why the app puts everything behind a [`ListingProvider`](../lib/listings/provider.ts)
interface — you can demo today and swap in a real feed with no UI changes.

---

## 1. RESO Web API — the industry standard

The modern RESTful standard for MLS data (replaced the deprecated RETS protocol). JSON
responses, OData query language, OAuth2 bearer tokens, standardized RESO Data Dictionary fields.

- **Access:** you cannot hit "RESO" directly — it's a spec. You contact each **local MLS** (with
  your broker's sponsorship), they approve your app, and issue `client_id` / `client_secret` +
  a token endpoint. Authenticate via OAuth2 client-credentials → bearer token (~8h) on each call.
- **Per-MLS approval is required**, with an IDX or VOW data agreement and broker sponsorship.
- **Coverage:** ~90% of US MLSs are RESO-certified; ~62% of subscribers have a live Web API feed.
- **Cost:** often included in MLS membership; IDX/VOW agreements range roughly $0–$500/yr per MLS.
- **Latency:** real-time to ~1 minute.

### Agent-level filtering (critical for this app)

RESO supports filtering listings to a single agent so each user only sees their own:

```
GET /Property?$filter=ListAgentMlsId eq 'AGENT_MLS_ID'
```

The field is usually **`ListAgentMlsId`** (some MLSs use `ListAgentKey` / `ListingAgentMlsId` —
names vary per MLS, confirm against that MLS's data dictionary). We store the agent's value on
`profiles.mls_agent_id` so any provider can filter by it.

---

## 2. Aggregators (one API, many MLSs)

Far faster than negotiating with each MLS separately — the right path once you target multiple
markets.

| Provider | Notes | Access / cost |
|---|---|---|
| **SimplyRETS** | Best MVP on-ramp. Agent brings their own MLS RETS/RESO credentials; SimplyRETS normalizes the feed. Agent add-on (`/agents`) for filtering. ~30-min refresh. | $49–$199/mo + ~$99 one-time per MLS feed. Live in days. |
| **Trestle (CoreLogic / Cotality)** | RESO Web API 2.0, broad US coverage, OAuth2 + OIDC, geospatial queries. | Self-signup + per-MLS approval; enterprise pricing. |
| **MLS Grid** | Unified RESO data across 100+ MLSs. OAuth2 long-lived tokens. Rate limits (2 req/s, 7,200/hr). | Subscription; pricing on request. |
| **Realtyna MLS Router API** | Certified RESO 2.0 aggregator, 150+ MLSs US/Canada, role-based filtering. | Application → approval; pricing on request. |
| **Spark API (FBS / Flexmls)** | For MLSs on the Flexmls platform; role-based access. | MLS-member approval. |
| **Bridge API (Zillow Group)** | Normalized MLS data, but **invite-only** with unclear coverage. | Partner negotiation. |

---

## 3. Consumer/public APIs — avoid

Realtor.com, Zillow, and Redfin do **not** offer usable public APIs for this. Zillow's public
API closed Sept 2021. Unofficial scraper APIs (via RapidAPI/Apify) violate ToS, lack agent
filtering, and aren't real-time MLS data — not suitable for a production agent tool.

The one pragmatic, ToS-respecting "scrape" we do ship is **single-URL import**: the agent pastes
a link to *their own* listing and we parse its public structured data (JSON-LD / OpenGraph). It's
a convenience for manual entry, not a bulk data source.

---

## 4. Onboarding reality

Direct RESO access typically takes **1–4 weeks**: broker sponsorship (1–7 days) → MLS application
(1–2 weeks typical) → IDX/VOW agreement signing. Aggregators compress this — SimplyRETS can be
live in days because the agent supplies credentials they already have.

---

## 5. Recommended path

1. **MVP / demo (shipped):** manual entry + paste-a-URL import. Zero approval friction.
2. **Early access:** **SimplyRETS** — implement `simplyrets-provider.ts` against
   `GET https://api.simplyrets.com/properties` with the agent's MLS credentials (stored in
   `mls_connections.credentials`), filter to their listings by `ListAgentMlsId`, map fields to
   `ListingDraft`.
3. **Scale:** a national aggregator (Realtyna / Trestle / MLS Grid) — one contract, many MLSs,
   built-in agent filtering. Same interface, swap the provider.

### How it maps to the code

- [`lib/listings/provider.ts`](../lib/listings/provider.ts) — the `ListingProvider` interface and
  `ListingDraft` shape every provider returns.
- [`lib/listings/index.ts`](../lib/listings/index.ts) — `getListingProvider(id)` factory; register
  new providers here.
- [`lib/listings/simplyrets-provider.ts`](../lib/listings/simplyrets-provider.ts) — a stub that
  already implements the interface; fill in `fetchListings` / `fetchOne`.
- `profiles.mls_agent_id` — the agent's `ListAgentMlsId`, captured in Settings, used to filter.
- `mls_connections` — stores the chosen provider + (encrypted) credentials per agent.

Adding a real provider requires **no UI or schema changes** — only a new file and one line in
the factory.

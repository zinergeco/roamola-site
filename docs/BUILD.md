# Roamola — Web App Build Instructions

**Version:** 1.0
**Audience:** engineers and coding agents building the platform
**Companion document:** `roamola-master-plan.html` (strategy, pricing, economics)

This document is the implementation spec. Where it conflicts with the master plan, this
document wins on *how*, the master plan wins on *why* and *what*.

---

## 0. Read this first

Three rules govern every decision in this build. They are not style preferences.

1. **Pages are rows, not files.** A page exists because a row in `page` says it should.
   Rendering is downstream. This is what makes bulk pruning, kill switches and template
   rollbacks possible. Never hand-author a page that a template could own.

2. **Every published fact traces to a `source_id`.** No orphan data enters the graph. If a
   value cannot be attributed, the field renders as "not available" — never as a plausible
   guess, never as an interpolation.

3. **Signals are append-only.** `UPDATE` on the `signal` table is a bug. The accumulated
   history is the company's only genuinely defensible asset and an overwrite destroys it
   irreversibly.

If a proposed change violates one of these, stop and escalate rather than working around it.

---

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js (App Router), TypeScript strict | ISR is mandatory — see §6 |
| Runtime | Node 20 LTS | Pin in `.nvmrc` and CI |
| Styling | Tailwind CSS + CSS custom properties for tokens | No component library; build the primitives |
| Database | PostgreSQL 16 + PostGIS | Geography is first-class, not an afterthought |
| ORM | Drizzle | Typed, migration-first, no runtime magic |
| Warehouse | ClickHouse | Events and time series only |
| Cache / queue | Redis + BullMQ | Pipeline orchestration, rate limiting |
| Search | Typesense | On-site search is a primary data source; make it good |
| Pipelines | Python 3.12 + Prefect | Separate service, separate repo package |
| LLM | Anthropic API behind an internal service | Never called directly from app code — see §8 |
| Auth | Clerk or Auth.js | Must support orgs and seats |
| Billing | Stripe | Never build billing |
| Email | Resend (transactional) + a marketing ESP | Separate concerns |
| Hosting | Vercel (app), Fly.io or Railway (pipelines), managed Postgres | |
| Object storage | S3-compatible | Raw source snapshots, exports, media |
| Monitoring | Sentry + Axiom + Checkly | Errors, logs, synthetic checks |

**Do not substitute the database, the ISR strategy or the append-only signal design.**
Everything else is negotiable with a written reason.

---

## 2. Repository layout

Single pnpm monorepo.

```
roamola/
├── apps/
│   ├── web/                  # Next.js — public site, tools, portals
│   └── admin/                # Internal: review queue, kill switch, source register
├── packages/
│   ├── db/                   # Drizzle schema, migrations, seed
│   ├── core/                 # Domain types, entity logic, shared validation
│   ├── generation/           # Template definitions, quality gates, LLM service
│   ├── analytics/            # Event schema, client, ClickHouse writers
│   └── ui/                   # Design primitives, charts, data tables
├── services/
│   └── pipelines/            # Python: ingest, normalise, validate, refresh
├── docs/
│   ├── BUILD.md              # this file
│   ├── SOURCES.md            # the source register — living document
│   ├── TEMPLATES.md          # one spec per page template
│   └── METHODOLOGY.md        # published publicly; keep it accurate
└── infra/
```

**Rule:** `apps/web` may import from `packages/*` but never from `services/*`. The pipelines
communicate only through the database. This boundary keeps the site deployable when the
pipelines are broken, which they will periodically be.

---

## 3. Environment

`.env.example` — commit this, never commit `.env`.

```bash
# Core
DATABASE_URL=postgresql://...
REDIS_URL=redis://...
CLICKHOUSE_URL=https://...
TYPESENSE_HOST=
TYPESENSE_API_KEY=

# Auth & billing
CLERK_SECRET_KEY=
CLERK_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Generation
ANTHROPIC_API_KEY=
GENERATION_ENABLED=false          # master switch; default OFF
GENERATION_DAILY_CAP=500          # hard ceiling, enforced in code

# Publishing controls
PUBLISH_ENABLED=false             # default OFF; flipped per §7 release stages
PUBLISH_MONTHLY_CAP=2000

# Storage & email
S3_BUCKET=
S3_ACCESS_KEY_ID=
S3_SECRET_ACCESS_KEY=
RESEND_API_KEY=

# Observability
SENTRY_DSN=
AXIOM_TOKEN=

# Feature flags
FLAG_ADS_ENABLED=false            # keep false until Phase 2
FLAG_STORE_ENABLED=false
FLAG_ASSETS_MODULE=false          # property module — legal sign-off required
```

`GENERATION_ENABLED` and `PUBLISH_ENABLED` default to `false` in every environment
including production. They are turned on deliberately, never by default, never in a
deploy script.

### Local setup

```bash
pnpm install
docker compose up -d              # postgres, redis, clickhouse, typesense
pnpm db:migrate
pnpm db:seed                      # loads one country's place hierarchy for dev
pnpm dev                          # web on :3000, admin on :3001
```

---

## 4. Database schema

Migration-first. Never edit a shipped migration; add a new one.

### 4.1 Core tables

```sql
-- Provenance register. Every fact points here.
CREATE TABLE source (
  id                SERIAL PRIMARY KEY,
  slug              TEXT UNIQUE NOT NULL,
  name              TEXT NOT NULL,
  url               TEXT NOT NULL,
  licence           TEXT NOT NULL,           -- explicit licence string
  licence_url       TEXT,
  commercial_use    BOOLEAN NOT NULL,
  redistributable   BOOLEAN NOT NULL DEFAULT false,
  attribution_text  TEXT,
  refresh_interval  INTERVAL NOT NULL,
  last_success_at   TIMESTAMPTZ,
  last_failure_at   TIMESTAMPTZ,
  schema_version    TEXT,
  active            BOOLEAN NOT NULL DEFAULT true
);

CREATE TABLE place (
  id            BIGSERIAL PRIMARY KEY,
  parent_id     BIGINT REFERENCES place(id),
  type          TEXT NOT NULL,               -- country|region|county|city|district
  slug          TEXT NOT NULL,
  canonical_name TEXT NOT NULL,
  country_code  CHAR(2) NOT NULL,
  timezone      TEXT NOT NULL,
  population    INTEGER,
  centroid      GEOGRAPHY(POINT, 4326) NOT NULL,
  boundary      GEOGRAPHY(MULTIPOLYGON, 4326),
  source_id     INTEGER NOT NULL REFERENCES source(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (parent_id, slug)
);
CREATE INDEX place_centroid_idx ON place USING GIST (centroid);
CREATE INDEX place_parent_idx ON place(parent_id);
CREATE INDEX place_type_country_idx ON place(type, country_code);

-- Multilingual and alternate names, kept out of place to avoid churn
CREATE TABLE place_name (
  place_id  BIGINT NOT NULL REFERENCES place(id) ON DELETE CASCADE,
  lang      CHAR(2) NOT NULL,
  name      TEXT NOT NULL,
  is_primary BOOLEAN NOT NULL DEFAULT false,
  PRIMARY KEY (place_id, lang, name)
);

CREATE TABLE property (
  id            BIGSERIAL PRIMARY KEY,
  place_id      BIGINT NOT NULL REFERENCES place(id),
  category      TEXT NOT NULL,               -- hotel|hostel|resort|holiday_let|campsite
  name          TEXT NOT NULL,
  capacity      INTEGER,
  attributes    JSONB NOT NULL DEFAULT '{}',
  location      GEOGRAPHY(POINT, 4326),
  operator_id   BIGINT REFERENCES account(id),
  verified_at   TIMESTAMPTZ,
  external_ids  JSONB NOT NULL DEFAULT '{}', -- {"partner_slug": "their-id"}
  source_id     INTEGER NOT NULL REFERENCES source(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX property_place_idx ON property(place_id, category);
CREATE INDEX property_external_ids_idx ON property USING GIN (external_ids);

CREATE TABLE experience (
  id          BIGSERIAL PRIMARY KEY,
  place_id    BIGINT NOT NULL REFERENCES place(id),
  theme       TEXT NOT NULL,                 -- controlled vocabulary, see core/vocab.ts
  name        TEXT NOT NULL,
  duration_min INTEGER,
  seasonality JSONB,                         -- {"months":[4,5,6,7,8,9]}
  price_band  TEXT,                          -- free|low|mid|high
  accessibility JSONB NOT NULL DEFAULT '{}',
  source_id   INTEGER NOT NULL REFERENCES source(id)
);

CREATE TABLE route (
  id                  BIGSERIAL PRIMARY KEY,
  origin_place_id     BIGINT NOT NULL REFERENCES place(id),
  destination_place_id BIGINT NOT NULL REFERENCES place(id),
  mode                TEXT NOT NULL,         -- air|rail|road|ferry
  duration_min        INTEGER,
  frequency_weekly    INTEGER,
  operators           TEXT[],
  seasonal            BOOLEAN NOT NULL DEFAULT false,
  source_id           INTEGER NOT NULL REFERENCES source(id),
  UNIQUE (origin_place_id, destination_place_id, mode)
);

-- Regulations. Highest trust value, highest harm risk. 100% human review.
CREATE TABLE rule (
  id                  BIGSERIAL PRIMARY KEY,
  subject_place_id    BIGINT NOT NULL REFERENCES place(id),
  counterpart_place_id BIGINT REFERENCES place(id),   -- NULL for place-only rules
  topic               TEXT NOT NULL,          -- visa|licensing|tax|restriction|health
  requirement         JSONB NOT NULL,
  summary             TEXT NOT NULL,
  source_url          TEXT NOT NULL,          -- must be a primary/official source
  source_id           INTEGER NOT NULL REFERENCES source(id),
  effective_from      DATE,
  verified_at         TIMESTAMPTZ NOT NULL,
  verified_by         BIGINT REFERENCES account(id),   -- a human. always.
  UNIQUE (subject_place_id, counterpart_place_id, topic)
);

-- APPEND ONLY. No UPDATE, no DELETE. Enforced by trigger below.
CREATE TABLE signal (
  id          BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,                 -- place|property|experience|route
  entity_id   BIGINT NOT NULL,
  metric      TEXT NOT NULL,                 -- adr|occupancy|sea_temp_c|seats|search_index
  value       NUMERIC NOT NULL,
  unit        TEXT NOT NULL,
  observed_at TIMESTAMPTZ NOT NULL,
  source_id   INTEGER NOT NULL REFERENCES source(id),
  confidence  NUMERIC(3,2) NOT NULL DEFAULT 1.00
);
CREATE INDEX signal_lookup_idx ON signal(entity_type, entity_id, metric, observed_at DESC);

CREATE OR REPLACE FUNCTION signal_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'signal is append-only: % attempted on signal.id=%', TG_OP, OLD.id;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER signal_no_mutate
  BEFORE UPDATE OR DELETE ON signal
  FOR EACH ROW EXECUTE FUNCTION signal_is_append_only();
```

### 4.2 Page, account and event

```sql
CREATE TYPE page_status AS ENUM ('draft','review','published','noindexed','removed');

CREATE TABLE page (
  id                 BIGSERIAL PRIMARY KEY,
  template           TEXT NOT NULL,
  entity_type        TEXT NOT NULL,
  entity_id          BIGINT NOT NULL,
  variant            JSONB NOT NULL DEFAULT '{}',  -- e.g. {"month":"june"}
  url                TEXT UNIQUE NOT NULL,
  status             page_status NOT NULL DEFAULT 'draft',
  completeness_score NUMERIC(4,3) NOT NULL,
  similarity_score   NUMERIC(4,3),
  content            JSONB,                        -- rendered blocks, not HTML
  generation_meta    JSONB,                        -- {model, prompt_hash, generated_at}
  published_at       TIMESTAMPTZ,
  last_verified_at   TIMESTAMPTZ,
  removed_reason     TEXT,
  UNIQUE (template, entity_type, entity_id, variant)
);
CREATE INDEX page_status_template_idx ON page(status, template);
CREATE INDEX page_published_idx ON page(published_at DESC) WHERE status = 'published';

CREATE TABLE account (
  id            BIGSERIAL PRIMARY KEY,
  external_id   TEXT UNIQUE NOT NULL,          -- auth provider id
  org_id        BIGINT REFERENCES organisation(id),
  email         TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'traveller', -- traveller|operator|investor|staff
  entitlements  TEXT[] NOT NULL DEFAULT '{}',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE organisation (
  id              BIGSERIAL PRIMARY KEY,
  name            TEXT NOT NULL,
  plan            TEXT NOT NULL DEFAULT 'free',
  stripe_customer_id TEXT UNIQUE,
  seats           INTEGER NOT NULL DEFAULT 1,
  verified_domain TEXT
);

CREATE TABLE entity_claim (
  id           BIGSERIAL PRIMARY KEY,
  account_id   BIGINT NOT NULL REFERENCES account(id),
  entity_type  TEXT NOT NULL,
  entity_id    BIGINT NOT NULL,
  method       TEXT NOT NULL,                 -- domain|document|phone
  status       TEXT NOT NULL DEFAULT 'pending',
  verified_at  TIMESTAMPTZ,
  UNIQUE (entity_type, entity_id, account_id)
);
```

Events go to ClickHouse, not Postgres:

```sql
CREATE TABLE event (
  event_id     UUID,
  occurred_at  DateTime64(3),
  session_id   String,
  account_id   Nullable(UInt64),
  type         LowCardinality(String),
  entity_type  LowCardinality(String),
  entity_id    Nullable(UInt64),
  template     LowCardinality(String),
  payload      String,                        -- JSON
  country      LowCardinality(String),
  device       LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (type, occurred_at, session_id);
```

---

## 5. Routing

Every route below is server-rendered. No route that should rank may be client-only.

```
apps/web/app/
├── (marketing)/
│   ├── page.tsx                                  /
│   ├── methodology/page.tsx                      /methodology
│   ├── sources/page.tsx                          /sources
│   └── corrections/page.tsx                      /corrections
├── places/
│   ├── [country]/page.tsx                        /places/portugal
│   ├── [country]/[region]/page.tsx
│   ├── [country]/[region]/[city]/page.tsx
│   └── [country]/[region]/[city]/[facet]/page.tsx
├── stays/[category]/[place]/page.tsx
├── experiences/[theme]/[place]/page.tsx
├── routes/[pair]/page.tsx                         /routes/manchester-to-faro
├── rules/[topic]/[subject]/[counterpart]/page.tsx /rules/visa/uk/vietnam
├── tools/
│   ├── page.tsx
│   └── [tool]/page.tsx
├── journal/[slug]/page.tsx
├── insights/[market]/page.tsx
├── assets/[market]/page.tsx                       # flag-gated
├── store/[product]/page.tsx                       # flag-gated
├── business/                                      # authenticated portals
│   ├── layout.tsx
│   ├── listings/
│   ├── benchmarks/
│   └── enquiries/
├── invest/                                        # authenticated
├── api/
│   ├── v1/                                        # public API, metered
│   ├── tools/[tool]/route.ts                      # tool computation endpoints
│   ├── events/route.ts                            # analytics ingest
│   └── webhooks/stripe/route.ts
├── sitemap-[segment].xml/route.ts                 # one per template
└── robots.txt/route.ts
```

### Routing rules

- **Facet slugs are a closed enum.** `[facet]` validates against a whitelist
  (`best-time-to-visit`, `cost`, `in-january` … ). Anything else returns 404, not a
  generated page. Open parameter space is how sites accidentally publish infinite URLs.
- **Trailing slashes off, lowercase enforced, redirect rather than duplicate.**
- **No query-string content.** Filters change client state; they never create indexable
  variants. If a filter combination deserves a page, it becomes a template.
- **404 vs 410.** A page that never existed → 404. A pruned page → 410 if genuinely dead,
  301 to its parent if the topic is still covered. Default to 301-to-parent.

---

## 6. Rendering strategy

```ts
// Destination pages: regenerate on data change, not on a timer
export const revalidate = 3600
export const dynamicParams = true

export async function generateStaticParams() {
  // Pre-render only the top ~2,000 pages by expected traffic.
  // Everything else renders on first request and caches. Do NOT try to
  // pre-build 100k pages — builds will take hours and fail.
  return topPagesByTemplate('destination', 2000)
}
```

**On-demand revalidation is the primary mechanism.** When a pipeline materially changes
data, it calls the revalidation endpoint for affected URLs:

```ts
// packages/generation/src/revalidate.ts
export async function revalidatePages(urls: string[]) {
  // Batch in chunks of 100; rate-limit to avoid thundering herd
  // Only called on MATERIAL change — see §8.4 delta thresholds
}
```

**Do not revalidate on every pipeline run.** Republishing unchanged pages wastes crawl
budget and reads as manipulative. The delta threshold check in §8.4 is what gates this.

### Performance budget — enforced in CI, not aspirational

| Metric | Budget | Enforcement |
|---|---|---|
| LCP (mobile, Slow 4G) | < 2.0s | Lighthouse CI, fails the build |
| INP | < 200ms | Lighthouse CI |
| CLS | < 0.05 | Lighthouse CI |
| JS shipped, content pages | < 120KB gzip | `next build` bundle check |
| JS shipped, tool pages | < 250KB gzip | |
| Server response TTFB | < 400ms p75 | Checkly |

A PR that breaks a budget does not merge. Ad scripts are the usual cause; they are
lazy-loaded below the fold with reserved space (§12).

---

## 7. Page generation and quality gates

This is the most important subsystem in the build. Implement it before any template.

### 7.1 Template definition

Every template is a typed object in `packages/generation/templates/`:

```ts
// packages/generation/templates/destination.ts
import { defineTemplate } from '../define'

export default defineTemplate({
  id: 'destination',
  entityType: 'place',
  entityFilter: { type: ['city', 'district'] },
  urlPattern: '/places/{country}/{region}/{slug}',

  // Gate 1: what must exist before this page may be generated
  requiredFields: [
    'place.centroid',
    'place.timezone',
    'signal.climate_monthly',      // >= 12 observations
    'signal.price_band',           // >= 20 observations
    'property.count',              // >= 5 properties
  ],
  minObservations: { 'signal.price_band': 20, 'signal.climate_monthly': 12 },
  maxAgeDays: { 'signal.price_band': 45, 'rule.*': 30 },
  minCompleteness: 0.72,

  // Must differ from parent — no page that just restates its region
  requiresUniqueData: ['signal.price_band', 'property.count'],

  // Gate 2
  maxSiblingSimilarity: 0.70,

  // Content contract — enforced, not advisory
  blocks: [
    'answer',            // 1-2 sentences, key figure + date
    'evidence',          // tables/charts from the graph
    'interpretation',    // THE ONLY GENERATED PROSE
    'practical',
    'tool',              // embedded, not linked
    'sources',
    'related',
  ],
  maxProseWordShare: 0.40,   // hard fail above this
  reviewSampleRate: 0.05,
})
```

Regulatory templates override: `reviewSampleRate: 1.0`. Non-negotiable, asserted in a test.

### 7.2 The gates, in order

```ts
// packages/generation/src/pipeline.ts
export async function generateBatch(templateId: string, limit: number) {
  assertEnabled('GENERATION_ENABLED')
  assertUnderCap('GENERATION_DAILY_CAP')

  const template = getTemplate(templateId)
  const candidates = await findCandidates(template, limit)

  // GATE 1 — data sufficiency
  const sufficient = []
  for (const c of candidates) {
    const score = await scoreCompleteness(c, template)
    if (score < template.minCompleteness) {
      await recordRollup(c, template)   // becomes a row on the parent page instead
      continue
    }
    sufficient.push({ ...c, completeness: score })
  }

  // Generate the interpretation block only. All other blocks are data renders.
  const drafts = await Promise.all(sufficient.map(c => renderDraft(c, template)))

  // GATE 2 — differentiation
  const similarities = await computeSiblingSimilarity(drafts)  // embeddings, cosine
  if (median(similarities) > template.maxSiblingSimilarity) {
    await flagTemplateForRework(templateId, similarities)
    throw new BatchRejected('template producing boilerplate — fix the template')
  }

  // Prose ratio check
  for (const d of drafts) {
    if (proseWordShare(d) > template.maxProseWordShare) {
      throw new BatchRejected(`prose ratio exceeded on ${d.url}`)
    }
  }

  // GATE 3 — human review queue
  await enqueueForReview(drafts, template.reviewSampleRate)
  return drafts.length
}
```

### 7.3 Completeness scoring

```ts
function scoreCompleteness(candidate, template): number {
  const required = template.requiredFields.length
  let score = 0
  for (const field of template.requiredFields) {
    const v = candidate.fields[field]
    if (v == null) continue
    if (belowMinObservations(field, v, template)) continue
    if (staleBeyond(field, v, template)) continue
    score += 1
  }
  let base = score / required
  // Penalise pages whose data is entirely inherited from the parent
  if (!hasUniqueData(candidate, template.requiresUniqueData)) base *= 0.6
  return round(base, 3)
}
```

### 7.4 Human review (admin app)

The review queue is a real product, not a spreadsheet. Reviewers see the rendered page,
the source data beside it, and a fixed rubric:

- [ ] Is the headline answer factually correct?
- [ ] Would a knowledgeable reader find anything embarrassing?
- [ ] Does every figure carry a date and a source?
- [ ] Does the page say anything the parent page does not?
- [ ] Is any claim present that is not in the underlying data?

**A batch failure rate above 5% blocks the entire batch** — not just the sampled pages.
Implement this as a hard block in code; it will be argued with under deadline pressure.

### 7.5 Release stages

Enforce in code, keyed off a `release_stage` config row:

| Stage | Monthly cap | Advance when |
|---|---|---|
| `pilot` | 200 total | indexation ≥ 80%, review sample passed |
| `expansion` | 2,000/mo | impressions trending up, no manual actions |
| `scale` | 10,000/mo | stable rank distribution across templates |
| `full` | 25,000/mo | pruning loop has completed a full cycle |

```ts
// Hard ceiling. No override flag. Changing stage is a deliberate config commit.
if (publishedThisMonth + batch.length > stageCap(currentStage)) {
  throw new CapExceeded()
}
```

### 7.6 Pruning

A scheduled job at day 90 and quarterly thereafter:

```ts
const verdict =
  impressions < 50 && clicks === 0        ? 'remove'  :
  avgPosition > 40 && impressions < 200   ? 'merge'   :
  engagementRate < 0.15                   ? 'improve' :
                                            'keep'
```

`remove` sets `status='removed'`, applies the redirect, drops it from the sitemap and
removes inbound internal links in the same transaction. **Budget for removing 20–30% of
everything published.** If the pruning rate is near zero, the gates are too loose.

---

## 8. Data pipelines

Python, in `services/pipelines/`. Nine flows, each with an explicit human checkpoint.

```
services/pipelines/
├── flows/
│   ├── ingest.py         # 1
│   ├── normalise.py      # 2
│   ├── validate.py       # 3
│   ├── generate.py       # 4 — calls the TS generation service over HTTP
│   ├── publish.py        # 5
│   ├── refresh.py        # 6
│   ├── monitor.py        # 7
│   ├── prune.py          # 8
│   └── distribute.py     # 9
├── connectors/           # one module per source, mirrors docs/SOURCES.md
└── lib/
    ├── provenance.py
    ├── anomaly.py
    └── snapshot.py
```

### 8.1 Ingest

```python
def ingest(source_slug: str):
    source = get_source(source_slug)
    assert source.active, f"{source_slug} is disabled"

    raw = connector(source_slug).fetch()

    # Snapshot raw to S3 BEFORE parsing. Raw is never overwritten.
    # This is what makes every pipeline run replayable.
    snapshot_key = f"raw/{source_slug}/{utcnow():%Y/%m/%d/%H%M%S}.json.gz"
    put_object(snapshot_key, raw)

    staged = parse(raw, schema_version=source.schema_version)

    # Silent source drift detection — the most common real-world failure
    check_row_count_delta(source_slug, len(staged), tolerance=0.25)
    check_distribution_shift(source_slug, staged, tolerance=0.15)

    stage(staged, source_id=source.id, retrieved_at=utcnow())
```

### 8.2 Normalise and entity resolution

Match incoming records to existing entities. Log a confidence score. Anything below
0.85 goes to a human queue rather than being auto-merged — a bad merge corrupts the
graph in ways that are very hard to unpick later.

### 8.3 Validate

```python
ANOMALY_RULES = [
    ("price_jump",      lambda s: abs(s.pct_change) > 0.60),
    ("impossible_temp", lambda s: not -50 < s.value < 60),
    ("null_surge",      lambda b: b.null_rate > 0.20),
    ("stale_source",    lambda src: src.days_since_success > src.refresh_days * 2),
]
```

**Any anomaly above tolerance halts publishing for the affected template.** It does not
warn and continue. Halting is cheap; publishing wrong data is not.

### 8.4 Refresh and delta thresholds

Only republish on material change:

| Field class | Material change | Action |
|---|---|---|
| Price / rate | > 5% move | regenerate evidence, revalidate |
| Regulation | any change | regenerate + **human review** + revalidate |
| Climate normals | any change | regenerate, revalidate |
| Supply counts | > 10% move | regenerate, revalidate |
| Cosmetic / copy | — | no republish |

Update `last_verified_at` when data is confirmed unchanged; update `published_at` only
on material change. Never backdate or hand-edit a verification timestamp to look fresh.

### 8.5 The LLM service

All model calls go through one internal service. App code never calls the API directly.

```ts
// packages/generation/src/llm.ts
export async function generateBlock(input: {
  template: string
  block: 'interpretation' | 'summary' | 'translation'
  facts: Fact[]          // ONLY facts already in the graph, each with source_id
  constraints: string[]
}): Promise<{ text: string; meta: GenerationMeta }> {

  // Contract:
  // - The model may only restate, compare and explain the facts passed in.
  // - It may not introduce a number, name, date or claim not present in `facts`.
  // - Output is validated against `facts` before return.

  const result = await callModel(buildPrompt(input))
  const violations = checkClaimsAgainstFacts(result.text, input.facts)
  if (violations.length) throw new UngroundedClaim(violations)

  return {
    text: result.text,
    meta: { model: MODEL_ID, promptHash: hash(input), generatedAt: utcnow() },
  }
}
```

`generation_meta` is stored on every page. When a systematic error is found, you query
by `promptHash` or `model` and reverse the entire affected set in one operation. Without
this you cannot recover from a bad prompt at scale.

---

## 9. Tools

Tools are the retention layer and the richest first-party data source. Build them as a
consistent pattern so the twentieth costs a fraction of the first.

```ts
// packages/core/tools/define.ts
export interface ToolSpec<I, O> {
  id: string
  title: string
  inputSchema: ZodSchema<I>
  compute: (input: I) => Promise<O>    // server-side always
  render: (output: O) => ReactNode
  captureEvents: string[]              // which interactions become events
  affiliateSlots?: AffiliateSlot[]     // contextual, relevant, disclosed
  gated?: { after: number; entitlement: string }
}
```

**Rules for every tool:**

- Computation runs server-side at `/api/tools/[tool]`. Never ship the logic to the client
  — it is proprietary and it must be instrumentable.
- The tool works without an account. Gating happens at *saving* the result, not at
  producing it.
- Every input and every completion is an event (§10). This is the point of the tool.
- Results have a shareable URL with an OG image. Shares are free distribution.
- Any affiliate slot is contextual and labelled before the link, never after.

**Build order — ship these three first, then decide the rest from usage data:**

1. `entry-requirements` — passport × destination → visa, documents, fees, duration
2. `best-month` — weather + price + crowd preferences → ranked calendar
3. `trip-budget` — party, style, dates → cost breakdown

Do not build the full suite on speculation. The event data from these three tells you
which of the remaining twenty are worth the effort.

---

## 10. Analytics and event capture

**Start on day one, before there is traffic.** Retrospective history cannot be created.

```ts
// packages/analytics/src/events.ts
export const EVENTS = {
  page_view:        z.object({ template: z.string(), entityId: z.number() }),
  tool_started:     z.object({ tool: z.string() }),
  tool_input:       z.object({ tool: z.string(), field: z.string(), value: z.unknown() }),
  tool_completed:   z.object({ tool: z.string(), durationMs: z.number() }),
  tool_abandoned:   z.object({ tool: z.string(), atField: z.string() }),
  search_performed: z.object({ query: z.string(), results: z.number() }),
  search_no_result: z.object({ query: z.string() }),      // ← template ideas live here
  affiliate_click:  z.object({ partner: z.string(), vertical: z.string() }),
  trip_saved:       z.object({ placeIds: z.array(z.number()) }),
  enquiry_sent:     z.object({ entityType: z.string(), entityId: z.number() }),
  listing_claimed:  z.object({ propertyId: z.number() }),
  upgrade_viewed:   z.object({ tier: z.string(), trigger: z.string() }),
} as const
```

`search_no_result` is the single highest-value event in the system. It is a list of
questions your audience has that you cannot yet answer — which is your template roadmap,
generated by your own users.

**Also capture as signals, from day one, even with no product using them yet:** daily
price observations, listing counts by place and category, route seat capacity, regulation
state, search interest. This is the moat accruing. It cannot be backfilled.

Consent: analytics events fire under legitimate interest with no cross-site identifiers.
Advertising and marketing cookies require explicit consent. Keep the two paths separate
in code so a consent decision cannot accidentally disable product analytics.

---

## 11. Auth, entitlements and billing

```ts
// packages/core/src/entitlements.ts
export const PLANS = {
  free:      { entitlements: ['tools.basic', 'trips.3'] },
  plus:      { entitlements: ['tools.all', 'trips.unlimited', 'ads.off', 'alerts.25'] },
  claim:     { entitlements: ['listing.manage', 'enquiries.inbox', 'stats.basic'] },
  pro:       { entitlements: ['benchmark.12m', 'forecast.8w', 'comps.5', 'export.csv'] },
  portfolio: { entitlements: ['benchmark.36m', 'forecast.26w', 'comps.25', 'api.basic',
                              'properties.10', 'markets.5', 'seats.5'] },
  analyst:   { entitlements: ['screener', 'yield.models', 'reg.alerts.10', 'reports.all'] },
  firm:      { entitlements: ['screener', 'yield.models', 'reg.alerts.unlimited',
                              'api.10k', 'seats.5', 'export.25k'] },
} as const

export function can(account: Account, entitlement: string): boolean
```

**Check entitlements server-side, in the data layer, not in the UI.** A hidden button is
not access control. Every gated query carries the check.

**Never gate accuracy or safety.** Regulatory answers, entry requirements and health
information are free at every tier, always. Gate depth, history, export and alerting.

Stripe integration:
- Webhooks are the source of truth for subscription state, not the client.
- Implement `checkout.session.completed`, `customer.subscription.updated`,
  `customer.subscription.deleted`, `invoice.payment_failed` at minimum.
- Grandfather early operators with a `price_id` pinned on the subscription. Do not
  migrate them on a price change.
- Trials: 14 days, no card, self-serve tiers only.

---

## 12. SEO implementation

### Sitemaps — one per template, never one big file

```ts
// app/sitemap-[segment].xml/route.ts
// Segments: destination, rules, routes, stays, experiences, tools, journal, insights
// Max 50,000 URLs per file; paginate as sitemap-destination-2.xml
// Index at /sitemap.xml
```

Segmenting is not cosmetic — it is how you diagnose indexation *per template* rather than
staring at a site-wide number that tells you nothing.

### Structured data

| Page type | Schema |
|---|---|
| Destination | `Place` + `TouristDestination` + `BreadcrumbList` |
| Stay category | `ItemList` of `LodgingBusiness` |
| Rules | `FAQPage` + `Article` with `dateModified` |
| Route | `Trip` |
| Insights | `Dataset` + `Article` |
| Journal | `Article` with a real `author` → `Person` |
| Tools | `WebApplication` |

`dateModified` must reflect actual material change (§8.4). Never emit a fresh date on
unchanged content.

### Head management

```ts
// Canonical: always self-referencing on published pages
// noindex: applied automatically when status != 'published'
// hreflang: same entity across languages, with x-default
// OG image: generated per page from the graph, not a generic brand image
```

### Kill switch

One admin action must, in a single transaction: set `noindex`, remove from the sitemap,
strip inbound internal links, and optionally 301. Build this in week one. You will need it
before you expect to.

### Ads (flag-gated, default off)

```ts
// FLAG_ADS_ENABLED stays false until: 50k+ monthly organic sessions,
// quality gates running for a full quarter, one pruning cycle completed.
```

When enabled: informational pages only. Never on tools, portals, enquiry or checkout
flows, never for paying subscribers. Max 3 units, none above the answer block. All units
lazy-loaded below the fold with reserved space so CLS stays within budget.

---

## 13. Public API

```
GET /api/v1/places/{id}
GET /api/v1/places/{id}/signals?metric=&from=&to=
GET /api/v1/rules?subject=&counterpart=&topic=
GET /api/v1/routes?origin=&destination=
GET /api/v1/markets/{id}/indicators
```

- Key-based auth, metered per §20 of the master plan rate card.
- Every call logged with account, endpoint, row count — contracts require audit trails.
- Rate limit per tier; return `429` with `Retry-After`, never silently truncate.
- **Licensed source data is never exposed through the API.** Derived statistics only.
  Enforce with a `redistributable` check against `source` at query time, not by convention.

---

## 14. Testing

| Layer | Tool | What must be covered |
|---|---|---|
| Unit | Vitest | Completeness scoring, entitlement checks, delta thresholds |
| Contract | Vitest | **LLM output contains no claim absent from `facts`** |
| Integration | Vitest + testcontainers | Pipeline runs against a real Postgres |
| E2E | Playwright | Each tool end to end; checkout; listing claim |
| Performance | Lighthouse CI | Budgets in §6, fails the build |
| SEO | Custom | Canonical present, schema valid, noindex correct per status |

Tests that must exist and must never be deleted:

```ts
test('signal table rejects UPDATE', ...)
test('regulatory templates have reviewSampleRate === 1.0', ...)
test('publishing respects the stage cap with no override path', ...)
test('generated prose share never exceeds template maxProseWordShare', ...)
test('non-redistributable sources are excluded from API responses', ...)
test('null values render as "not available", never as 0 or an interpolation', ...)
```

These encode the three rules in §0. If someone deletes one, that is the signal.

---

## 15. Build order

Do not reorder. Each milestone exists because the next one depends on it.

### M1 — Foundations (weeks 1–4)

- Monorepo, CI, environments, `.env.example`
- Full schema + migrations + append-only trigger
- `source` register populated from `docs/SOURCES.md`
- Event capture live and writing to ClickHouse **before any traffic**
- Admin app shell with the kill switch working

**Done when:** you can insert a place, attach a signal, fail to update that signal, and
see an event in ClickHouse.

### M2 — Data spine (weeks 5–8)

- Ingest + normalise + validate for geographic, regulatory and climate sources
- Place hierarchy populated and verified for the launch markets
- Raw snapshotting to S3, replay proven by re-running a past date
- Anomaly detection halting a deliberately poisoned test batch

**Done when:** a pipeline run is fully replayable from raw and a bad batch is blocked
automatically.

### M3 — First template end to end (weeks 9–12)

- Template definition system, completeness scorer, similarity check, prose-ratio check
- `destination` template rendering from the graph
- Review queue in admin with the rubric
- Sitemap segment, schema, canonical, `noindex` on non-published
- **200-page pilot published**

**Done when:** 200 pages are live, 100% reviewed, and indexation is measurable per
template.

### M4 — Tools and accounts (weeks 13–18)

- Tool framework + the three launch tools
- Auth, accounts, saved trips, entitlements
- Search with `search_no_result` capture
- Newsletter capture at the moment of value (no interstitials, no first-visit modals)

**Done when:** a user can complete a tool, save the result, and the entire interaction is
queryable as events.

### M5 — Scale the engine (weeks 19–26)

- Templates 2–6 (`rules`, `best-time`, `cost`, `stays`, `routes`)
- Refresh pipeline with delta thresholds
- Monitoring dashboard: performance **by template**, not by page
- First pruning cycle executed and acted on
- Affiliate integration, disclosed, on two verticals

**Done when:** the pruning loop has removed pages and site-wide average position improved.

### M6 — Business layer (weeks 27–38)

- Partner portal: claim, verify, manage, enquiry inbox
- Operator tools: benchmarking, forecast, comp alerts
- Insights Hub at three depths
- Stripe, plans, trials, grandfathering
- Ads enabled **only if** the §12 preconditions are met

**Done when:** an operator can claim a listing, hit a free-tier limit, upgrade, and churn
is measurable.

### M7 — Moat products (weeks 39+)

- Investor portal, screener, yield models
- Public API with metering and audit logging
- Property module — **blocked on written legal sign-off per jurisdiction**
- Reports and institutional licensing

---

## 16. Conventions

- TypeScript `strict: true`. No `any`; use `unknown` and narrow.
- Zod at every boundary: API input, tool input, pipeline output, LLM output.
- Money as integer minor units. Never floats.
- All timestamps `TIMESTAMPTZ`, stored UTC, rendered in the place's timezone.
- Server Components by default; `'use client'` only for genuine interactivity.
- No `localStorage` for anything that must survive; state belongs in the database.
- Conventional commits. Squash merge. Trunk-based with short-lived branches.
- Every migration reversible or explicitly marked one-way with a reason.

---

## 17. Definition of done

A feature ships when all of these are true:

- [ ] Tests pass, including the protected tests in §14
- [ ] Performance budgets met (§6)
- [ ] WCAG 2.2 AA: keyboard reachable, visible focus, contrast, data tables with real
      `<th>` and captions, charts with text alternatives
- [ ] Events instrumented for the new surface
- [ ] Entitlement checks server-side, not UI-only
- [ ] Provenance visible on any page showing data
- [ ] Kill switch applies to any new page type
- [ ] Docs updated: `SOURCES.md` for a new source, `TEMPLATES.md` for a new template

---

## 18. Things that will be argued for and must be refused

Recorded here so the answer is already written down when the pressure arrives.

| Proposal | Why it is refused |
|---|---|
| "Publish 20k pages this month to hit the traffic target" | Stage caps exist because rapid mass publishing is the clearest signal of scaled content abuse. Ramp over quarters. |
| "Skip review on this batch, it's the same as last time" | Batch sampling is the only thing standing between this and a content farm. |
| "Turn ads on early, we need revenue" | Ads before 50k sessions earn a rounding error and cost rankings and ad-account standing. §22 of the master plan: halving ad RPM costs 4% of year-three revenue. |
| "Let the model fill the gap where data is missing" | An ungrounded number is the failure mode that ends the project's credibility. Render "not available". |
| "Just update the signal row instead of inserting" | Destroys the history, which is the only asset a competitor cannot buy. |
| "Ship the property module now, get legal later" | Financial promotion and estate agency rules carry personal liability. |
| "Add a newsletter pop-up on first visit" | Measurably damages ranking, tool completion and trust. Capture at the moment of value. |
| "Use the affiliate feed data in the paid dashboard" | Licensed for promotion, not resale. This is a contract breach, not a grey area. |

---

## 19. Where to look when something breaks

| Symptom | First check |
|---|---|
| Pages not indexing | Sitemap segment for that template; `status`; canonical; server render present |
| Traffic drop on one template | Similarity score drift; recent refresh churn; crawl log for that segment |
| Pipeline producing nulls | Source schema version vs `source.schema_version`; row-count delta alert |
| Wrong figures live | Query `page.generation_meta` by `promptHash`, reverse the affected set in bulk |
| Tool completion falling | Ad density on that page; INP budget; error rate in the compute endpoint |
| Operator churn rising | Activation rate first, then feature usage by cohort — not pricing |

---

*Build instructions v1.0. Revenue and volume figures referenced here are illustrative
models from the master plan, not forecasts. Legal, tax and regulatory positions require
professional advice per jurisdiction before the relevant module launches.*

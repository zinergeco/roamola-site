# Roamola

Travel intelligence platform — see `docs/BUILD.md` (technical spec) and
the master plan / UI plan for the why and the what.

## Status

**Live at roamola.com**, behind the dev-gate password (see below) — this
replaced the coming-soon page 2026-09-14. What's live is the M1
build-status dashboard in `apps/web`, not the data-backed platform; see
`docs/DECISIONS.md` for the full cutover note and a bug found and fixed
right after the first deploy.

What exists:

- `apps/web` — a real, running, password-gated Next.js app
  (`middleware.ts` + `/login` + `/api/login`), deployed on Coolify via the
  same Dockerfile-build-on-push pipeline the old coming-soon page used.
  Home page is an honest, hand-maintained milestone-status dashboard, not
  placeholder content.
- `packages/db/src/schema.ts` — the full Postgres schema from BUILD.md §4,
  in corrected table-creation order (the source doc has a forward-reference
  bug; see `docs/DECISIONS.md` #1).
- `packages/generation/` — the template-definition type, the reference
  `destination` template, and the LLM-service contract (unimplemented
  stubs past the type signatures — the actual prompt/validation logic is
  M3 work, once there's real data to generate from).
- `packages/analytics/src/events.ts` — the event schema, ready to wire up
  before any traffic exists, per BUILD.md §10.
- `packages/core/src/entitlements.ts` — the plan/entitlement table.
- `services/pipelines/` — Python/Prefect flow stubs (`ingest.py`,
  `validate.py`); the rest of the nine flows aren't started.
- `docs/SOURCES.md`, `docs/TEMPLATES.md`, `docs/METHODOLOGY.md` — stubs to
  fill in as the corresponding milestones land.
- `docker-compose.yml` — self-hosted Postgres+PostGIS/Redis/ClickHouse/
  Typesense, for local dev; not yet provisioned in Coolify for prod.

What doesn't exist yet: a database connected in production (Postgres/Redis/
ClickHouse/Typesense aren't provisioned in Coolify yet), any pipeline
connector, any real source data, real auth (still the shared dev-gate
password, not Auth.js).

## Local dev (once decisions are confirmed and deps installed)

```bash
pnpm install
docker compose up -d
cp .env.example .env   # fill in DATABASE_URL etc.
pnpm db:generate        # drizzle-kit generate from schema.ts
pnpm db:migrate
```

## Build order

Do not reorder — BUILD.md §15 explains why each milestone depends on the
last. M1 = this commit's scope: schema + event capture + admin shell
(admin shell not started) + kill switch (not started).

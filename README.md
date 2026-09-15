# Roamola

Travel intelligence platform — see `docs/BUILD.md` (technical spec) and
the master plan / UI plan for the why and the what.

## Status

**Live at roamola.com**, behind the dev-gate password (see below) — this
replaced the coming-soon page 2026-09-14. **M1 (BUILD.md §15) is complete**
as of the same day: real Postgres+PostGIS, Redis and ClickHouse are
provisioned in Coolify and wired up, the schema is migrated, the admin
shell and kill switch are live, and event capture is writing to
ClickHouse. See `docs/DECISIONS.md` for the full cutover note, the M1
completion note, and a redirect bug found and fixed right after the first
deploy.

What exists:

- `apps/web` — a real, running, password-gated Next.js app
  (`middleware.ts` + `/login` + `/api/login`), deployed on Coolify via the
  same Dockerfile-build-on-push pipeline the old coming-soon page used.
  Home page is an honest, hand-maintained milestone-status dashboard, not
  placeholder content.
- `apps/web/app/admin` — the admin shell (`/admin` overview,
  `/admin/system-check`, `/admin/kill-switch`), behind the same dev
  password. `/admin/system-check` runs BUILD.md's own M1 acceptance test
  live, on demand, against production Postgres and ClickHouse.
  `/admin/kill-switch` is the single-transaction page-status action from
  BUILD.md §12, minus the content-graph parts (link-stripping, 301) that
  need real templates (M3) to exist first.
- `packages/db/src/schema.ts` + `packages/db/migrations/` — the full
  Postgres schema from BUILD.md §4 (corrected table order, see
  `docs/DECISIONS.md` #1), now migrated into production, plus the
  append-only trigger on `signal` and the PostGIS extension bootstrap.
  Migrations run automatically on every container start
  (`scripts/container-init.mjs`).
- `packages/analytics/src/clickhouse.ts` — the ClickHouse HTTP-interface
  writer behind `/api/events` and the system-check page; the `event` table
  is created (idempotently) on every container start too.
- `packages/generation/` — the template-definition type, the reference
  `destination` template, and BUILD.md §7's gate engine (data-sufficiency
  scoring, sibling-similarity check, prose-ratio check) — real and
  unit-tested (`pnpm --filter @roamola/generation test`), proven end to
  end against a synthetic fixture batch the same way M2's mechanics were
  proven against `test_fixture.py`
  (`pnpm --filter @roamola/generation m3:check`). The LLM-service contract
  (`llm.ts`) is real except for the actual model call, left unimplemented
  on purpose — wiring up a real provider is a deliberate, credentialed
  decision not made yet, same category as `DATABASE_URL`/`S3_*` were for
  M2. No real candidate data has been generated against yet:
  `db-adapter.ts`'s Postgres queries are real and type-checked but
  unexercised, since there's no real source data behind them
  (`docs/SOURCES.md` is still empty, see below).
- `packages/core/src/entitlements.ts` — the plan/entitlement table.
- `services/pipelines/` — Python/Prefect. `ingest.py` and `validate.py`
  are real now (raw-to-S3 snapshot, replay from a stored snapshot,
  anomaly detection that halts a poisoned batch before it touches
  Postgres) — see `services/pipelines/README.md`. Deployed as its own
  Coolify resource (`roamola-pipelines`) and **verified live in
  production**: `scripts/m2_check.py`, BUILD.md's own M2 acceptance
  test, run directly on that container against real production
  Postgres+PostGIS and MinIO (S3-compatible) — all 4 checks pass. Only
  connector is `test_fixture.py`, explicitly synthetic/not real — no
  real source exists yet (see below). The rest of the nine flows aren't
  started.
- `docs/SOURCES.md`, `docs/TEMPLATES.md`, `docs/METHODOLOGY.md` — stubs to
  fill in as the corresponding milestones land.
- `docker-compose.yml` — the same Postgres+PostGIS/Redis/ClickHouse/
  Typesense stack for local dev (Typesense isn't provisioned in Coolify
  yet — nothing needs on-site search before M3's templates exist).

What doesn't exist yet: any pipeline connector, any real source data
(`docs/SOURCES.md` is still empty on purpose — market/source selection is
M2 business work, not something to fabricate), real auth (still the shared
dev-gate password, not Auth.js), and Typesense in production.

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
last. M1 is complete and verified live (see `docs/DECISIONS.md`). M2's
pipeline mechanics (ingest, snapshot, replay, anomaly blocking) are also
now verified live in production (see `docs/DECISIONS.md`); the milestone
itself stays "in progress" because the actual data-spine work — choosing
launch markets, vetting and connecting real sources — has not started, on
purpose (business decision, `docs/SOURCES.md` is still empty). M3's gate
engine (data-sufficiency, differentiation, prose-ratio checks) is now real
and tested the same way, ahead of schedule relative to M2 finishing —
also blocked from going further by the same missing decision, since there
is nothing real to run it against yet.

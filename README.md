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
  `destination` template, and the LLM-service contract (unimplemented
  stubs past the type signatures — the actual prompt/validation logic is
  M3 work, once there's real data to generate from).
- `packages/core/src/entitlements.ts` — the plan/entitlement table.
- `services/pipelines/` — Python/Prefect. `ingest.py` and `validate.py`
  are real now (raw-to-S3 snapshot, replay from a stored snapshot,
  anomaly detection that halts a poisoned batch before it touches
  Postgres) — see `services/pipelines/README.md`. Proven live against a
  real Postgres+PostGIS instance and an S3-compatible store via
  `scripts/m2_check.py`, BUILD.md's own M2 acceptance test. Only
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
last. M1 is complete and verified live (see `docs/DECISIONS.md`). M2 is
in progress: the pipeline mechanics (ingest, snapshot, replay, anomaly
blocking) are real and proven against real infra; the actual data-spine
work — choosing launch markets, vetting and connecting real sources — has
not started, on purpose (business decision, `docs/SOURCES.md` is still
empty).

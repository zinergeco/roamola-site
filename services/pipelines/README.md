# Roamola pipelines

Python 3.12 + Prefect, per BUILD.md §8. Nine flows, each with an explicit
human checkpoint: `ingest → normalise → validate → generate → publish →
refresh → monitor → prune → distribute`.

**Boundary that matters:** this service talks to Postgres/ClickHouse/S3
directly. `apps/web` never imports from here — see BUILD.md §2, "this
boundary keeps the site deployable when the pipelines are broken, which
they will periodically be."

## M2 status (2026-09-14)

`ingest.py` and `validate.py` are now real, not stubs — snapshot-to-S3,
parse, anomaly-check, and stage-to-Postgres all actually run, proven live
against a real Postgres+PostGIS instance and an S3-compatible store by
`scripts/m2_check.py`, which is BUILD.md §15's own M2 acceptance test:

> "Done when: a pipeline run is fully replayable from raw and a bad batch
> is blocked automatically."

Run it with:

```bash
cd services/pipelines
pip install -r requirements.txt
DATABASE_URL=... S3_ENDPOINT=... S3_BUCKET=... S3_ACCESS_KEY_ID=... S3_SECRET_ACCESS_KEY=... \
  python3 scripts/m2_check.py
```

**What's still a stub, on purpose:** `normalise.py` (entity resolution /
confidence scoring, BUILD.md §8.2), and flows 4–9
(`generate/publish/refresh/monitor/prune/distribute`) — those depend on
real templates (M3) or real published pages existing first, per BUILD.md
§15's own build order. `connectors/` has exactly one module,
`test_fixture.py`, and it is explicitly **not a real data source** — see
its own docstring. Choosing 3–4 launch markets and vetting real,
licensed geographic/regulatory/climate sources for `docs/SOURCES.md` is
still Day 1–30 business work (master plan §32) that nobody has done yet;
building a real connector against a real source is next, once that
decision is made — not something to fabricate from this seat.

`lib/anomaly.py` is the real, executable version of the `ANOMALY_RULES`
table BUILD.md §8.3 defines (which `validate.py` still keeps verbatim as
the declarative source of truth); `lib/snapshot.py` is the raw-to-S3
layer BUILD.md §8.1 describes; `lib/provenance.py` mirrors the
find-or-create pattern `apps/web/app/admin/system-check/actions.ts`
already proved live for M1, just via psycopg instead of Drizzle.

## Deploying

`Dockerfile` builds this service the same way `apps/web`'s own Dockerfile
builds the Next.js app — see its header comment for the Coolify resource
config. The container stays idle (no public port, no scheduler yet);
flows are run on demand inside it via Coolify's terminal, the same way
`container-init.mjs`'s migration step and the admin routes run inside the
`apps/web` container rather than from an outside client with no route to
the internal `coolify` Docker network.

**MinIO is provisioned and real** (2026-09-15, `roamola-minio` Coolify
Compose service — see `docs/DECISIONS.md`). `S3_ENDPOINT` in
`.env.example` is the verified internal hostname; `S3_ACCESS_KEY_ID`/
`S3_SECRET_ACCESS_KEY` are the service's `MINIO_ROOT_USER`/
`MINIO_ROOT_PASSWORD` (shared with Zinerge in chat, not committed).
`roamola-pipelines` itself is not deployed yet — that needs the
`93cb1ae` commit pushed to `main` first — so `m2_check.py` has not yet
run against this real MinIO/production Postgres. That's the next step
once the push lands: deploy this Dockerfile as its own Coolify resource
on the `coolify` network, then run `m2_check.py` inside it via Coolify's
terminal, mirroring how `/admin/system-check` proved M1 live.

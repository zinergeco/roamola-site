# Roamola pipelines

Python 3.12 + Prefect, per BUILD.md §8. Nine flows, each with an explicit
human checkpoint: `ingest → normalise → validate → generate → publish →
refresh → monitor → prune → distribute`.

Only `ingest.py` and `validate.py` have any real content yet (M1 scope is
the schema and the generation gates, not a working connector — that's M2,
and needs docs/SOURCES.md populated with real, licensed sources first).

**Boundary that matters:** this service talks to Postgres/ClickHouse/S3
directly. `apps/web` never imports from here — see BUILD.md §2, "this
boundary keeps the site deployable when the pipelines are broken, which
they will periodically be."

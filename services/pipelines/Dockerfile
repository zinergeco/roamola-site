# Roamola pipelines (services/pipelines) -- BUILD.md §8, §2's boundary rule
# ("apps/web may import from packages/*, never from services/*, and vice
# versa -- this keeps the site deployable when the pipelines are broken,
# which they will periodically be").
#
# Coolify config this must match (Roamola / production, new resource
# "roamola-pipelines"), mirroring apps/web's own Dockerfile-on-Coolify
# pattern:
#   Build strategy: Dockerfile, base directory "/services/pipelines"
#   Docker network: coolify (same internal network as roamola-postgres,
#     roamola-clickhouse, roamola-minio -- reachable by resource hostname,
#     not exposed publicly, same as the other M1/M2 infra)
#
# This container has no public port and isn't meant to serve traffic --
# it exists so DATABASE_URL/S3_*/CLICKHOUSE_* env vars set on this
# resource put it on the same Docker network as the databases, and so
# `python3 scripts/m2_check.py` (or a real Prefect flow, once M2 grows
# beyond the synthetic fixture) can be run inside it via Coolify's own
# terminal/execute-command, the same way container-init.mjs's migration
# step and apps/web's own admin routes run *inside* that app's container
# rather than from an outside client with no route to the internal
# network. The default CMD just stays alive; nothing here polls or
# schedules on its own yet -- see docs/DECISIONS.md for what's real vs
# still-a-stub.

FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Idle on purpose -- see the header comment. Flows are run on demand
# (`python3 scripts/m2_check.py`, or `python3 -m flows.ingest` once a
# CLI entrypoint exists), not on a schedule, until a real Prefect
# deployment is worth standing up.
CMD ["sleep", "infinity"]

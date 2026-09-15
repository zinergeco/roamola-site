# Open decisions and corrections

Written after cross-reading BUILD.md, the master plan and the UI plan
together. Nothing below blocks the schema/scaffold work in this commit —
it blocks the *next* step (getting a real database up, a real repo pushed,
real credentials issued).

## Corrections made to the source documents

1. **SQL forward-reference bug, BUILD.md §4.1–4.2.** `property.operator_id`
   references `account(id)`, and `account.org_id` references
   `organisation(id)` — but both `account` and `organisation` are defined
   *after* the tables that point at them. Postgres can't create a table
   with a FK to a table that doesn't exist yet. Fixed table order in
   `packages/db/src/schema.ts`:
   `source → place → place_name → organisation → account → property →
   experience → route → rule → signal → page → entity_claim`.

2. **Two different "phase" schemes, not obviously reconciled.** BUILD.md
   §15 defines **7 engineering milestones (M1–M7)**, sequenced by technical
   dependency, in week numbers (weeks 1–4 through 39+). The master plan §29
   defines **5 go-to-market phases (Phase 0–4)**, sequenced by what has to
   be commercially true before the next thing works, in month numbers
   (months 1–3 through 21–24+). They're answering different questions
   ("what do we build in what order" vs. "what do we launch in what
   order") and don't map 1:1 — M1–M3 (weeks 1–12, roughly months 1–3) sit
   inside Phase 0; M4 (weeks 13–18) straddles Phase 0/1; M5 (weeks 19–26)
   is Phase 1; M6 (weeks 27–38) is Phase 2; M7 (weeks 39+) is Phase 2/3.
   Worth treating as two axes on purpose rather than trying to force one
   number — but flagging it since "how many phases" doesn't have a single
   answer as written.

3. **Master plan §27 says "ten tables carry the platform."** The actual
   schema in BUILD.md §4 has twelve Postgres tables (adds `place_name`,
   `organisation`, `entity_claim` beyond the ten named) plus `event` in
   ClickHouse, not Postgres. Treated BUILD.md as authoritative here — it
   says explicitly it wins on *how* where the two documents conflict
   (§0). The master plan's ten is the simplified illustrative version.

## Decisions — confirmed 2026-09-14

1. **Hosting stack: self-host everything on Coolify.** Confirmed. Postgres
   +PostGIS, Redis, ClickHouse, Typesense and the Next.js app all run as
   Docker services on the existing `turingminds-live-p16g` OVHcloud box —
   `docker-compose.yml` in this repo is the working assumption for that
   topology. No Vercel, no Fly.io/Railway, no managed databases.

2. **Repo strategy: replace `zinergeco/roamola-site`'s contents.** Confirmed,
   and done (2026-09-14). The monorepo replaced the coming-soon page on
   `main` directly — Zinerge asked to "push directly and make live... 
   exactly how postoque.com" rather than stage on a branch first, overriding
   the branch-first sequencing originally planned here. `apps/web`'s
   Dockerfile builds and runs on Coolify (`roamola-site`, project
   **Roamola**/production) the same way the old nginx Dockerfile did —
   same build strategy, same port 80, same auto-deploy-on-push webhook —
   so the cutover was a normal deploy, not a new pipeline.
   **Push mechanism note:** this cloud sandbox's own git access is gated
   by session-level repo authorization ("the git proxy") independent of
   any GitHub PAT — a manually-supplied PAT could read the repo but was
   refused on push ("not in this session's authorized repository set").
   Zinerge's linked Mac (via the device bridge) has no such restriction,
   so the actual push ran from a git clone in that device's sandboxed
   shell, using the PAT Zinerge generated. Worth knowing for any future
   push to this repo from a session without a linked device.

3. **Delivery mechanism: fine-grained PAT.** Confirmed and used. Zinerge
   generated a fine-grained GitHub token scoped to `zinergeco/roamola-site`
   (Contents: Read and write) 2026-09-14; per the note above it ended up
   being used from the linked device's shell rather than this cloud
   sandbox directly. Never written to any file or to memory.

4. **Auth provider.** BUILD.md §1 lists "Clerk or Auth.js." Still
   defaulting to Auth.js in `.env.example` — no external account, no new
   monthly bill, consistent with self-hosting everything else — pending
   any objection.

5. **Live cutover (2026-09-14).** roamola.com now serves the login-gated
   M1 dashboard in place of the coming-soon page — verified live via
   browser, not just "deployed." One bug found and fixed post-deploy: the
   post-login redirect in `apps/web/app/api/login/route.ts` used
   `req.url`, which in the Node-runtime API route (unlike Edge
   middleware's `req.nextUrl`) doesn't reflect the public host behind
   Coolify's Traefik proxy — it resolved to `https://localhost:80` instead
   of `https://roamola.com`, breaking login in production while working
   fine locally. Fixed by building the redirect target from
   `X-Forwarded-Proto`/`X-Forwarded-Host` instead of trusting `req.url`;
   verified locally by replaying the exact header shape Traefik sends,
   then confirmed live.

## Dev gate

The whole app is behind a single shared password (`apps/web/middleware.ts` +
`/login`), stored hashed in the cookie, checked against
`DEV_ACCESS_PASSWORD`. This is not the real auth system (see decision #4
above) — it exists only so nothing half-built is publicly reachable while
M1–M3 are in progress, per Zinerge's instruction to "develop all inside a
login protected page." The password lives in the local `.env` (gitignored,
never committed) and was shared with Zinerge directly in chat, not filed
anywhere written to disk or memory.

6. **M1 completed (2026-09-14).** Postgres+PostGIS, Redis and ClickHouse are
   now provisioned as Coolify resources in the same `Roamola` project as
   `roamola-site`, on the same internal Docker network (`coolify`) --
   reachable by service hostname, not exposed publicly. `DATABASE_URL`,
   `CLICKHOUSE_URL`/`_USER`/`_PASSWORD`/`_DATABASE` and `REDIS_URL` are set
   as production env vars on the app. `packages/db/migrations/` now holds
   two real migrations generated from `schema.ts` (`0000_init_schema.sql`,
   with `CREATE EXTENSION IF NOT EXISTS postgis` prepended -- Drizzle has no
   notion of extensions, and the geography columns need it before they can
   be created) and `0001_append_only_signal.sql` (the trigger + the two
   CHAR(2) fixes, folded in from the old hand-written stub). Both run on
   every container start via `scripts/container-init.mjs`
   (`drizzle-kit migrate`, then an idempotent ClickHouse
   `CREATE TABLE IF NOT EXISTS event`), ahead of `next start` -- see the
   Dockerfile.

   The admin shell (BUILD.md's "admin app shell with the kill switch
   working") lives at `/admin` inside `apps/web`, behind the existing dev
   password, rather than as the separately-specified `apps/admin` app on
   its own port/subdomain. That second app is scaffolded
   (`apps/admin/package.json`) but deliberately not stood up yet --
   splitting it means a second Coolify resource, a second domain, and a
   second deploy pipeline for a shell that right now needs three pages and
   zero real users. Revisit once there's an actual reason (real staff
   accounts, M4) to pull it out.

   `/admin/system-check` runs BUILD.md §15's own M1 acceptance test, live,
   on demand: insert a place, attach a signal, attempt to update that
   signal (expected to fail -- the trigger rejecting it is the pass
   condition), fire a ClickHouse event and read it back. `/admin/kill-switch`
   implements BUILD.md §12's single-transaction status change
   (published/draft → noindexed/removed) against the real `page` table;
   since M3 hasn't built the first template yet, there are no real pages to
   act on, so the page can create one clearly-marked fixture row to test
   against. "Strip inbound internal links" and the optional 301 from §12
   are content-graph operations against real templates -- not implemented,
   and the admin UI says so rather than faking it.

## M2 groundwork (2026-09-14, in progress)

Real pipeline mechanics, not the launch-market/real-source work M2 also
needs (that part is still untouched and still a business decision — see
"Not blocking, just noted" below):

- `services/pipelines/lib/snapshot.py` — raw-to-S3 (BUILD.md §8.1),
  S3-compatible via boto3 against whatever `S3_ENDPOINT` points at.
- `services/pipelines/lib/provenance.py` — the same find-or-create
  pattern `admin/system-check/actions.ts` already proved live for M1,
  reimplemented in psycopg (per BUILD.md §2's boundary: `services/*` and
  `apps/web` never import from each other).
- `services/pipelines/lib/anomaly.py` — the real, executable version of
  the `ANOMALY_RULES` BUILD.md §8.3 defines; `flows/validate.py` keeps
  the rule table verbatim as the spec-diffable source of truth and now
  calls into this for real.
- `services/pipelines/connectors/test_fixture.py` — a synthetic,
  clearly-marked (not real) test connector, deterministic fake places
  under country_code `ZZ`. Exists purely so the pipeline mechanics can be
  proven end to end without fabricating real geographic data or
  pre-empting the launch-market decision. Has a `poisoned=True` mode
  (one impossible `sea_temp_c` reading) for the anomaly-blocking test.
- `services/pipelines/flows/ingest.py` — real now: fetch/replay → S3
  snapshot → parse → anomaly-check (halts before any DB write) → stage.
  `replay_from=<snapshot_key>` re-runs from stored raw instead of the
  live connector — the actual replay mechanism.
- `services/pipelines/scripts/m2_check.py` — BUILD.md §15's own M2
  acceptance test ("a pipeline run is fully replayable from raw and a bad
  batch is blocked automatically"), run live. **Verified passing** against
  a real local Postgres 16 + PostGIS 3 instance (schema loaded from the
  actual production migration files — this also independently confirmed
  the geography-type migration fix above is syntactically correct) and a
  real S3-compatible endpoint (moto, for the local proof only). Not yet
  run against *production* Postgres/S3 — that needs a MinIO resource
  provisioned on Coolify and this service deployed there, both blocked
  as of this note on the device-bridge connection to Zinerge's Mac
  dropping mid-session. `services/web/app/page.tsx`'s M2 status reflects
  this honestly as "in-progress," not "done."
- `services/pipelines/Dockerfile` — builds this service the same way
  `apps/web`'s Dockerfile does, for a future `roamola-pipelines` Coolify
  resource on the same internal `coolify` network as
  roamola-postgres/roamola-clickhouse/the not-yet-provisioned MinIO.

**Still not done, still not fabricated:** `docs/SOURCES.md` is still
empty. No real connector exists. `normalise.py` (entity resolution) and
flows 4–9 are still stubs, correctly, since they depend on M3's templates
or real published pages.

## MinIO provisioned (2026-09-15)

Real Coolify resource, not a placeholder:

- **Type: Docker Compose service, not "Docker Image."** Coolify's plain
  "Docker Image" application type has no field to set a container start
  command -- confirmed by inspecting its Livewire fields
  (`customDockerRunOptions` only supports docker-run *options* like
  `--entrypoint`, never a trailing command/args), and MinIO's official image
  requires an explicit `server /data --console-address ":9001"` command or
  it exits immediately. Deleted the half-configured "Docker Image" attempt
  and recreated as a one-service "Docker Compose (Empty)" resource instead,
  which Coolify auto-recognised as a MinIO template (it generated
  "MinIO · Admin User/Password" fields from the `MINIO_ROOT_USER`/
  `MINIO_ROOT_PASSWORD` compose env vars).
- **Image: `quay.io/minio/minio:latest`, not `minio/minio`.** Docker Hub's
  `minio/minio` (and `minio/mc`) now refuses anonymous pulls -- MinIO Inc.
  discontinued that distribution channel at some point after this
  environment's training cutoff; first deploy attempt failed with
  `pull access denied for minio/minio, repository does not exist or may
  require 'docker login'`. `quay.io/minio/minio` is the current official
  home (confirmed via several other projects' 2026 migration PRs). Worth
  remembering for any future MinIO/mc image reference in this repo.
- **Network: "Connect to the predefined Coolify network"** (a toggle
  Coolify exposes for Compose-based services, separate from anything
  declared inside the compose file itself) -- puts it on the same
  `coolify` network as roamola-postgres/clickhouse/redis/site.
- **Internal hostname is *not* the service name.** Verified empirically
  from inside the roamola-site container (Coolify's per-app Terminal):
  `roamola-minio` does not resolve (`wget: bad address`), but the
  Docker-assigned `container_name` does --
  `roamola-minio-i8gdnlavccngszyuzytx7bfl` resolves via `getent hosts` and
  `GET /minio/health/live` on port 9000 returns a real `200 OK` /
  `Server: MinIO` response. Coolify names Compose containers
  `<service>-<resource-uuid>`, not just `<service>`, unlike its native
  Database resources (roamola-postgres et al., which do get the plain
  resource name as hostname). `.env.example`'s `S3_ENDPOINT` is set to
  this verified hostname.
- **Credentials:** `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` set as the
  service's env vars (Coolify's generated "MinIO · Admin User/Password"
  fields); a fresh random password, shared with Zinerge directly in chat
  the same way `DEV_ACCESS_PASSWORD` was -- not written to any file or to
  memory.
- **Storage:** a real named Docker volume (`..._minio-data` → `/data`),
  durable across redeploys, same pattern as the Postgres/ClickHouse data
  volumes.
- Bucket (`roamola-raw`) is not created manually -- `lib/snapshot.py`'s
  `ensure_bucket()` creates it on first real run, same as the local/moto
  proof already showed.

Not yet done: `roamola-pipelines` itself isn't deployed as a Coolify
resource yet (blocked on the `93cb1ae` commit being pushed -- see the push
mechanism note above; this session's sandbox can't push directly, so
that's Zinerge's step), so `m2_check.py` hasn't been run against this real
MinIO yet. That's the next concrete step once the push lands.

## M2 verified live in production (2026-09-15)

Once the push landed, `roamola-pipelines` was deployed as its own Coolify
resource and `scripts/m2_check.py` was run directly on that container
against real production Postgres+PostGIS and MinIO -- not local/moto
proxies. **All 4 checks pass:**

- `[PASS]` raw-snapshot bucket exists (S3-compatible, real MinIO)
- `[PASS]` fresh ingest of the `test-fixture` connector (3 places, 4
  signals staged into real Postgres)
- `[PASS]` replay of that same run from its raw S3 snapshot -- content
  hash matches, 4 fresh signal rows appended (signal is append-only; a
  replay is a new observation, not a dedupe) -- this is BUILD.md's M2
  "replayable from raw" criterion, proven live
- `[PASS]` a deliberately poisoned batch (`impossible_temp` rule,
  `sea_temp_c=150.0` outside `(-50, 60)`) correctly halted before
  touching Postgres -- the "bad batch is blocked automatically" half of
  the same criterion

Overall: **PASS -- M2 done-when condition satisfied**, live, in
production.

Setup notes, for the record:

- **Resource config**: "Git Repository (with GitHub App)" via the same
  `turing-minds-uk` App `roamola-site` already uses, Dockerfile build
  strategy, base directory `/services/pipelines`, on the shared `coolify`
  network (application-type resources join it automatically, unlike
  Compose services which need the explicit toggle). No public port --
  the container sits idle (`CMD sleep infinity`) and flows are run on
  demand via Coolify's Terminal feature, same as this verification run.
- **Env vars**: `DATABASE_URL`, `S3_ENDPOINT`, `S3_BUCKET`,
  `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`. The S3 vars were correct on
  the first attempt. `DATABASE_URL` took three attempts to land correctly
  -- Coolify's masked per-row env-var edit field turned out to be
  unreliable for this: a JS-driven edit read back correctly in the DOM
  and produced a "Success" toast, but didn't actually propagate to the
  container on Restart *or* Redeploy (silently kept serving the old
  value). The fix was a real-keystroke edit -- clear the field
  completely first, retype, verify via read-only inspection, save, then
  **Redeploy** (not Restart -- Restart reuses the existing container and
  its baked-in env; only Redeploy recreates it with current values).
  Worth remembering for any future masked-field env var edit in Coolify.
- This mirrors the M1 incident's lesson from the same masked-input class
  of bug (see above) -- confirms it's a general Coolify UI quirk, not a
  one-off.

**Still not done, still not fabricated:** `docs/SOURCES.md` is still
empty, no real connector exists, and `normalise.py` plus flows 4-9 remain
stubs. M2 the *milestone* (real sources, real launch markets) is not
done; M2 the *mechanics* (BUILD.md's actual "done when" acceptance test)
now is, live, per the run above. `apps/web/app/page.tsx` reflects this
distinction rather than collapsing it.

## M3 gate engine built and tested (2026-09-15)

Same division as M2: build and prove the *mechanics* against a synthetic
fixture while the *milestone* itself (200 real pages live) stays blocked
on the same unmade business decision (launch markets, `docs/SOURCES.md`).
BUILD.md §7 calls this gate engine "the most important subsystem in the
build" and says to implement it before any template -- that's what this
entry covers, in `packages/generation/`:

- `src/completeness.ts` -- BUILD.md §7.3's `scoreCompleteness`, with its
  three undefined helper predicates (`belowMinObservations`,
  `staleBeyond`, the unique-data penalty) actually implemented, not
  restated as pseudocode. Pure function, no I/O.
- `src/similarity.ts` -- Gate 2 (differentiation). BUILD.md's own
  pseudocode says "embeddings, cosine"; this is deliberately NOT real
  embeddings -- a real embedding call is the same category of deliberate,
  credentialed infrastructure decision `DATABASE_URL`/`S3_*` were for M2,
  not something to do implicitly while building the gate that consumes
  it. What's here is a real, deterministic bag-of-words term-frequency
  cosine over each draft's `interpretation` block (the one block that's
  ever LLM-written) -- correctly catches near-duplicate boilerplate, and
  is swappable for a real embeddings call later without changing
  `pipeline.ts`'s call signature.
- `src/prose.ts` -- the prose-ratio check: interpretation word count as a
  share of the draft's total word count.
- `src/pipeline.ts` -- `runGates` (the three gates, in order, pure) and
  `generateBatch` (the real BUILD.md §7.2 entrypoint: checks
  `GENERATION_ENABLED` and `GENERATION_DAILY_CAP` unconditionally first,
  fails closed with neither set, and enforces §7.5's release-stage publish
  cap with no override, exactly as specified).
- `src/llm.ts` -- `buildPrompt`, `hashPrompt`, and
  `checkClaimsAgainstFacts` are now real. The last of those is, in the
  module's own words, "the single most safety-critical piece of code in
  the generation package" (BUILD.md §14's protected contract test: *LLM
  output contains no claim absent from `facts`*) -- implemented as a
  numeric-token extraction and cross-check against the supplied facts:
  deliberately conservative (a correct derived number can false-positive),
  which is the right failure direction for a grounding check.
  `callModel()` stays unimplemented, on purpose -- see below.
- `src/db-adapter.ts` -- a real, type-checked Postgres-backed
  `findDestinationCandidates` (queries `place`/`signal`/`property`,
  computes each candidate's field observations and counts) and
  `persistDraft`/`publishedThisMonth` against the real `page` table.
  **Not run live** -- doing so would write `page` rows for a template
  with zero real underlying source data, which is exactly what BUILD.md
  §0 rule 2 exists to prevent ("no orphan data enters the graph").
  `persistRollup` is a real, callable no-op: BUILD.md §7.2's "becomes a
  row on the parent page instead" has no parent page to attach to yet,
  since none has ever been generated.
- `src/fixtures/test-fixture.ts` -- synthetic destination candidates
  (slug prefix `test-`, `ZZ` country code, same convention as
  `services/pipelines/connectors/test_fixture.py`), covering: a
  sufficient candidate, one below `minObservations` on two fields, one
  penalised by the unique-data check, and matching renderers for
  distinct/boilerplate/prose-heavy drafts. It exercises the real, shipped
  `destination` template object, not a copy of it.
- `scripts/m3_check.ts` -- the TypeScript-side counterpart to
  `m2_check.py`: same console PASS/FAIL banner shape, runs the fixture
  batch through `runGates` and proves all five cases (two rollup reasons,
  a clean mixed-batch split, Gate 2 rejecting boilerplate, the prose-ratio
  gate rejecting an over-prose draft). **Run live, in this sandbox** (no
  Postgres or Coolify needed -- this proof is pure logic, unlike M2's,
  which needed real infra): `PASS -- gate engine behaves per BUILD.md
  §7.2 on every case`.
- 42 Vitest unit/contract tests across `completeness`, `similarity`,
  `prose`, `pipeline`, `define`, and `llm` -- including BUILD.md §14's two
  protected tests by name: `regulatory templates have reviewSampleRate
  === 1.0` and `LLM output contains no claim absent from facts`. All
  passing (`pnpm --filter @roamola/generation test`), and
  `pnpm --filter @roamola/generation typecheck` is clean.

**Drive-by fix, unrelated to M3 itself:** `packages/db`'s own `typecheck`
script was already broken (`tsc --noEmit` failed on `process` with no
`@types/node`) before any of this work started -- caught by running
`pnpm -r typecheck` to confirm nothing here broke anything else. Added
`@types/node` to `packages/db` (matching the version `apps/web` already
uses) rather than leaving it red. `apps/admin` still has no `tsconfig.json`
at all and its `typecheck` script does nothing -- left alone; it's a
vestigial scaffold from before the M1 decision to build the admin shell
into `apps/web` instead (see `decisionsConfirmed` in `page.tsx`), not
something this session's scope should touch.

**Still not done, still not fabricated:** `docs/SOURCES.md` is still
empty, no real connector exists, and `callModel()` in `llm.ts` is still
unimplemented (a model-provider decision, not made). M3 the *milestone*
("200 pages live, 100% reviewed") is not done and can't be until real
source data exists; M3's gate engine is real and proven the way M2's
pipeline mechanics were. `apps/web/app/page.tsx`'s M3 status reflects
this as "in-progress," the same distinction M2 draws.

## Not blocking, just noted

- `GENERATION_ENABLED` and `PUBLISH_ENABLED` default `false` everywhere,
  including this scaffold. BUILD.md §3 is explicit that these are never
  flipped by a deploy script.
- No real source has been vetted yet (`docs/SOURCES.md` is empty on
  purpose) — master plan §32 puts "choose 3–4 launch markets" and "build
  the source register" as literal Day 1–30 work, before pipeline code.

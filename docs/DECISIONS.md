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

## Not blocking, just noted

- `GENERATION_ENABLED` and `PUBLISH_ENABLED` default `false` everywhere,
  including this scaffold. BUILD.md §3 is explicit that these are never
  flipped by a deploy script.
- No real source has been vetted yet (`docs/SOURCES.md` is empty on
  purpose) — master plan §32 puts "choose 3–4 launch markets" and "build
  the source register" as literal Day 1–30 work, before pipeline code.

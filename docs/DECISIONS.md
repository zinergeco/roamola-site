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

2. **Repo strategy: replace `zinergeco/roamola-site`'s contents.** Confirmed.
   The monorepo becomes this repo — not a new one. Coolify's existing app
   (`roamola-site`, project **Roamola**/production, host port `3005`,
   domain already attached and SSL already issued) stays; only what's
   inside the repo changes.
   **Sequencing note:** that Coolify app currently builds an `nginx:alpine`
   Dockerfile serving a single `index.html` (the coming-soon page shipped
   2026-09-13), and its webhook auto-deploys on every push to `main`.
   Pushing the monorepo straight onto `main` before there's a working
   Dockerfile for `apps/web` and the DB/Redis/ClickHouse/Typesense
   services actually exist in Coolify would break the live site on the
   next auto-deploy. Plan: push the scaffold to a branch first (not
   `main`), build the real Next.js app and provision the new Coolify
   services against that branch, and only merge to `main` (cutting over
   the live coming-soon page) once `apps/web` actually builds and serves
   something real.

3. **Delivery mechanism: fine-grained PAT.** Confirmed. Zinerge is
   generating a fine-grained GitHub token scoped to `zinergeco/roamola-site`
   with Contents: Read and write, for this session to push with directly —
   replacing the browser-upload flow for anything beyond single-file edits.

4. **Auth provider.** BUILD.md §1 lists "Clerk or Auth.js." Still
   defaulting to Auth.js in `.env.example` — no external account, no new
   monthly bill, consistent with self-hosting everything else — pending
   any objection.

## Dev gate

The whole app is behind a single shared password (`apps/web/middleware.ts` +
`/login`), stored hashed in the cookie, checked against
`DEV_ACCESS_PASSWORD`. This is not the real auth system (see decision #4
above) — it exists only so nothing half-built is publicly reachable while
M1–M3 are in progress, per Zinerge's instruction to "develop all inside a
login protected page." The password lives in the local `.env` (gitignored,
never committed) and was shared with Zinerge directly in chat, not filed
anywhere written to disk or memory.

## Not blocking, just noted

- `GENERATION_ENABLED` and `PUBLISH_ENABLED` default `false` everywhere,
  including this scaffold. BUILD.md §3 is explicit that these are never
  flipped by a deploy script.
- No real source has been vetted yet (`docs/SOURCES.md` is empty on
  purpose) — master plan §32 puts "choose 3–4 launch markets" and "build
  the source register" as literal Day 1–30 work, before pipeline code.

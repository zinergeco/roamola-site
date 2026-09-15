# Template register

One entry per template defined in `packages/generation/src/templates/`.
BUILD.md §17 (Definition of Done) requires this file updated whenever a
template is added.

## destination

- File: `packages/generation/src/templates/destination.ts`
- Status: definition unchanged since M1; the *gate engine* that consumes
  it (`packages/generation/src/{completeness,similarity,prose,pipeline}.ts`)
  is now real and unit-tested (`pnpm --filter @roamola/generation test`)
  and proven end to end against a synthetic fixture batch
  (`pnpm --filter @roamola/generation m3:check`, mirroring
  `services/pipelines/scripts/m2_check.py`). Not yet wired to real data --
  `db-adapter.ts`'s `findDestinationCandidates` is real, type-checked
  Postgres-backed code but has not been run live, since there is no real
  source data behind it yet (`docs/SOURCES.md` is still empty).
- Pattern: `{city}` — master plan §7 estimates ~6,000 realistic pages
- Gate thresholds: `minCompleteness 0.72`, `maxSiblingSimilarity 0.70`,
  `maxProseWordShare 0.40`, `reviewSampleRate 0.05`

_(The other eleven templates in the master plan §7 catalogue — best time to
visit, cost of travel, entry rules, route, stay category, experience
category, month, comparison, itinerary, market snapshot, short-let rules —
are not yet defined. Per BUILD.md §15 build order, `destination` and `entry
rules` are the two that M3/Phase 0 actually needs end to end; the rest wait
for M5.)_

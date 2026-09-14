# Template register

One entry per template defined in `packages/generation/src/templates/`.
BUILD.md §17 (Definition of Done) requires this file updated whenever a
template is added.

## destination

- File: `packages/generation/src/templates/destination.ts`
- Status: defined (M1 scaffold), not yet wired to real data
- Pattern: `{city}` — master plan §7 estimates ~6,000 realistic pages
- Gate thresholds: `minCompleteness 0.72`, `maxSiblingSimilarity 0.70`,
  `maxProseWordShare 0.40`, `reviewSampleRate 0.05`

_(The other eleven templates in the master plan §7 catalogue — best time to
visit, cost of travel, entry rules, route, stay category, experience
category, month, comparison, itinerary, market snapshot, short-let rules —
are not yet defined. Per BUILD.md §15 build order, `destination` and `entry
rules` are the two that M3/Phase 0 actually needs end to end; the rest wait
for M5.)_

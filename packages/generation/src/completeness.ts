/**
 * BUILD.md §7.3, made real. The pseudocode in the spec calls
 * `belowMinObservations` / `staleBeyond` / `hasUniqueData` without defining
 * them -- this file is those definitions, not a re-statement of the
 * pseudocode.
 *
 * A `Candidate` is deliberately data-source-agnostic: it doesn't know
 * whether its fields came from a real Postgres query or a synthetic
 * fixture. That's what lets the same scorer be unit-tested against fixture
 * candidates today and, unchanged, run against `db-adapter.ts`'s real
 * `findCandidates()` once real source data exists.
 */

import type { TemplateDefinition } from "./define";

export interface FieldObservation {
  /** Field has a non-null value at all. */
  present: boolean;
  /** How many observations back it (e.g. 12 monthly climate readings). Omit for fields that are single-valued, not observation-counted (e.g. `place.centroid`). */
  observationCount?: number;
  /** Age of the most recent observation, in days. Omit for fields `maxAgeDays` doesn't constrain. */
  ageDays?: number;
}

export interface Candidate {
  entityType: TemplateDefinition["entityType"];
  entityId: string;
  url: string;
  fields: Record<string, FieldObservation>;
  /** Whether this candidate has data in `requiresUniqueData` fields that is NOT purely inherited/duplicated from its parent entity. */
  hasUniqueData: boolean;
}

export interface ScoredCandidate extends Candidate {
  completeness: number;
}

/** `maxAgeDays` keys may be an exact field name ("signal.price_band") or a
 * wildcard prefix ("rule.*", matching any field starting with "rule."). */
function matchesAgePattern(pattern: string, field: string): boolean {
  if (pattern === field) return true;
  if (pattern.endsWith(".*")) return field.startsWith(pattern.slice(0, -1));
  return false;
}

export function belowMinObservations(
  field: string,
  obs: FieldObservation,
  template: TemplateDefinition,
): boolean {
  const min = template.minObservations[field];
  if (min == null) return false;
  return (obs.observationCount ?? 0) < min;
}

export function staleBeyond(field: string, obs: FieldObservation, template: TemplateDefinition): boolean {
  if (obs.ageDays == null) return false;
  for (const [pattern, maxDays] of Object.entries(template.maxAgeDays)) {
    if (matchesAgePattern(pattern, field) && obs.ageDays > maxDays) return true;
  }
  return false;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * BUILD.md §7.3 verbatim, with the three helper predicates filled in. Pure
 * function, no I/O -- the same reason `lib/anomaly.py`'s `check_batch` in
 * services/pipelines is pure: this is a gate, and a gate you can't unit
 * test in isolation is a gate nobody will trust under deadline pressure.
 */
export function scoreCompleteness(candidate: Candidate, template: TemplateDefinition): number {
  const required = template.requiredFields.length;
  if (required === 0) return 0;

  let score = 0;
  for (const field of template.requiredFields) {
    const obs = candidate.fields[field];
    if (!obs || !obs.present) continue;
    if (belowMinObservations(field, obs, template)) continue;
    if (staleBeyond(field, obs, template)) continue;
    score += 1;
  }

  let base = score / required;
  // Penalise pages whose "unique" data is entirely inherited from the parent.
  if (template.requiresUniqueData.length > 0 && !candidate.hasUniqueData) {
    base *= 0.6;
  }
  return round3(base);
}

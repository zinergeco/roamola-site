/**
 * SYNTHETIC TEST FIXTURE -- not real destination candidates or content.
 *
 * Mirrors services/pipelines/connectors/test_fixture.py's own convention:
 * every "place" referenced here is fictional (slug prefix `test-`, no
 * relation to any real geography), used only to prove pipeline.ts's gate
 * mechanics end to end -- the actual, literal content of what BUILD.md §7
 * calls "the most important subsystem in the build." It exercises the
 * real, shipped `destination` template (../templates/destination.ts),
 * not a copy of it, the same way test_fixture.py's connector runs through
 * the real ingest.py flow rather than a parallel test-only path.
 */

import destinationTemplate from "../templates/destination";
import type { Candidate } from "../completeness";
import type { ScoredCandidate } from "../completeness";
import type { Draft } from "../draft";

export const template = destinationTemplate;

function baseFields() {
  return {
    "place.centroid": { present: true },
    "place.timezone": { present: true },
  };
}

/** Meets every threshold in the real `destination` template (§7.1: 12 climate obs, 20 price_band obs, 5 properties, fresh). */
export const sufficientCandidateA: Candidate = {
  entityType: "place",
  entityId: "900001",
  url: "/places/zz/test-country/test-city-a",
  fields: {
    ...baseFields(),
    "signal.climate_monthly": { present: true, observationCount: 12, ageDays: 10 },
    "signal.price_band": { present: true, observationCount: 25, ageDays: 5 },
    "property.count": { present: true, observationCount: 8 },
  },
  hasUniqueData: true,
};

export const sufficientCandidateB: Candidate = {
  ...sufficientCandidateA,
  entityId: "900002",
  url: "/places/zz/test-country/test-city-b",
};

/**
 * climate_monthly (3 obs, needs 12) and price_band (5 obs, needs 20) both
 * fall below the template's minObservations -- 2 of 5 required fields
 * don't count, so completeness = 3/5 = 0.6, below minCompleteness 0.72.
 * Must roll up, not render.
 */
export const insufficientCandidate: Candidate = {
  entityType: "place",
  entityId: "900003",
  url: "/places/zz/test-country/test-city-c",
  fields: {
    ...baseFields(),
    "signal.climate_monthly": { present: true, observationCount: 3, ageDays: 10 },
    "signal.price_band": { present: true, observationCount: 5, ageDays: 5 },
    "property.count": { present: true, observationCount: 8 },
  },
  hasUniqueData: true,
};

/** Every field present and fresh -- but hasUniqueData: false triggers the 0.6 penalty (§7.3), dropping 1.0 to 0.6, below minCompleteness 0.72. */
export const inheritedOnlyCandidate: Candidate = {
  ...sufficientCandidateA,
  entityId: "900004",
  url: "/places/zz/test-country/test-city-d",
  hasUniqueData: false,
};

// Realistic block-length ratios matter here, not just placeholder text:
// the prose-ratio gate compares interpretation's word count against every
// other block combined, so these need to look like the data-heavy
// non-prose renders BUILD.md §7.1 describes (a table, a source list, a
// related-pages list), not one-line stubs -- otherwise the fixture itself
// would trip the gate regardless of what the pipeline code does.
function fixtureDraft(candidate: ScoredCandidate, interpretation: string): Draft {
  return {
    url: candidate.url,
    entityId: candidate.entityId,
    blocks: {
      answer: `This fixture page reports a made-up average daily rate near 120 (fixture currency) and a made-up average temperature near 22 degrees, drawn only from fixture rows, entity ${candidate.entityId}.`,
      evidence: "Fixture evidence table -- price_band: 25 fixture rows, avg 120; climate_monthly: 12 fixture rows, avg 22.0c; property.count: 8 fixture listings across 3 fixture categories.",
      interpretation,
      practical: "Fixture practical block -- check-in notes, fixture currency conversion tips, fixture transport links, and fixture seasonal notes a real practical block would carry for a traveller.",
      tool: "[fixture embedded budget-estimator tool placeholder -- not a real interactive component in this test]",
      sources: "Fixture source list -- internal-test licence only, not redistributable, not a real citation, generated purely to exercise the pipeline's gates.",
      related: "Fixture related-pages list -- links to the other fixture cities and the fixture country overview page, none of them real destinations.",
    },
  };
}

/** Each candidate gets genuinely distinct interpretation prose -- should pass Gate 2 (differentiation). */
const DISTINCT_INTERPRETATIONS: Record<string, string> = {
  "900001":
    "This fixture entity represents a low-lying coastal setting: mild winters, warm summers, and a dataset skew toward beach-adjacent budget stays plus short ferry links to nearby fixture towns.",
  "900002":
    "This fixture entity represents an elevated inland setting: cool evenings, a hiking-trail reputation, and a dataset skew toward mid-range guesthouse clusters rather than any waterfront lodging.",
};

export function renderDistinct(candidate: ScoredCandidate): Draft {
  return fixtureDraft(
    candidate,
    DISTINCT_INTERPRETATIONS[candidate.entityId] ??
      `This fixture entity (${candidate.entityId}) carries its own randomly-assigned descriptive angle, deliberately unlike its siblings' assigned angles, used only to prove the similarity gate distinguishes real variation from boilerplate.`,
  );
}

/** Identical interpretation text across every sibling -- the boilerplate pattern Gate 2 exists to catch and reject. */
export function renderBoilerplate(candidate: ScoredCandidate): Draft {
  return fixtureDraft(
    candidate,
    "This interpretation text is exactly identical across every sibling page in this batch, " +
      "which is precisely the boilerplate pattern Gate 2 exists to catch and reject before it " +
      "ever reaches production.",
  );
}

/** `interpretation` block deliberately dominates total word count -- should fail the prose-ratio check. */
export function renderProseHeavy(candidate: ScoredCandidate): Draft {
  const longProse = Array.from({ length: 200 }, (_, i) => `syntheticfillerword${i}`).join(" ");
  return {
    url: candidate.url,
    entityId: candidate.entityId,
    blocks: {
      answer: "Short.",
      evidence: "a b c",
      interpretation: longProse,
      practical: "short",
      tool: "[tool]",
      sources: "src",
      related: "rel",
    },
  };
}

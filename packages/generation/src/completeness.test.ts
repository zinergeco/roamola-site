import { describe, expect, it } from "vitest";
import { scoreCompleteness } from "./completeness";
import { sufficientCandidateA, insufficientCandidate, inheritedOnlyCandidate, template } from "./fixtures/test-fixture";

describe("scoreCompleteness (BUILD.md §7.3)", () => {
  it("scores a fully-populated, fresh, unique candidate at 1.0", () => {
    expect(scoreCompleteness(sufficientCandidateA, template)).toBe(1);
  });

  it("meets the real destination template's minCompleteness threshold", () => {
    expect(scoreCompleteness(sufficientCandidateA, template)).toBeGreaterThanOrEqual(template.minCompleteness);
  });

  it("penalises a field below minObservations", () => {
    // climate_monthly has 3 observations, needs 12 -- that field doesn't count.
    const score = scoreCompleteness(insufficientCandidate, template);
    expect(score).toBeLessThan(1);
    expect(score).toBeLessThan(template.minCompleteness);
  });

  it("applies the 0.6 unique-data penalty and drops below minCompleteness even with every field present", () => {
    const score = scoreCompleteness(inheritedOnlyCandidate, template);
    expect(score).toBe(0.6); // 1.0 * 0.6
    expect(score).toBeLessThan(template.minCompleteness);
  });

  it("treats a missing field as absent (score 0 contribution), not an error", () => {
    const missingField = { ...sufficientCandidateA, fields: { ...sufficientCandidateA.fields } };
    delete (missingField.fields as Record<string, unknown>)["property.count"];
    const score = scoreCompleteness(missingField, template);
    expect(score).toBeLessThan(1);
  });

  it("treats a stale observation (older than maxAgeDays) as not counting", () => {
    const stale = {
      ...sufficientCandidateA,
      fields: {
        ...sufficientCandidateA.fields,
        "signal.price_band": { present: true, observationCount: 25, ageDays: 999 }, // maxAgeDays.price_band = 45
      },
    };
    const score = scoreCompleteness(stale, template);
    expect(score).toBeLessThan(1);
  });

  it("returns 0 for a template with no required fields (degenerate case)", () => {
    const emptyTemplate = { ...template, requiredFields: [] };
    expect(scoreCompleteness(sufficientCandidateA, emptyTemplate)).toBe(0);
  });
});

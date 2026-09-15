import { describe, expect, it } from "vitest";
import { computeSiblingSimilarity, median } from "./similarity";
import { sufficientCandidateA, sufficientCandidateB, renderDistinct, renderBoilerplate } from "./fixtures/test-fixture";
import type { ScoredCandidate } from "./completeness";

const scoredA: ScoredCandidate = { ...sufficientCandidateA, completeness: 1 };
const scoredB: ScoredCandidate = { ...sufficientCandidateB, completeness: 1 };

describe("computeSiblingSimilarity (BUILD.md §7.2 Gate 2)", () => {
  it("scores genuinely distinct interpretation text well below the template's maxSiblingSimilarity", () => {
    const drafts = [renderDistinct(scoredA), renderDistinct(scoredB)];
    const sims = computeSiblingSimilarity(drafts);
    expect(median(sims)).toBeLessThan(0.7);
  });

  it("scores identical interpretation text at similarity 1", () => {
    const drafts = [renderBoilerplate(scoredA), renderBoilerplate(scoredB)];
    const sims = computeSiblingSimilarity(drafts);
    expect(sims).toEqual([1, 1]);
    expect(median(sims)).toBeGreaterThan(0.7);
  });

  it("scores a lone draft (no siblings) at 0", () => {
    const sims = computeSiblingSimilarity([renderDistinct(scoredA)]);
    expect(sims).toEqual([0]);
  });
});

describe("median", () => {
  it("handles empty, odd, and even-length arrays", () => {
    expect(median([])).toBe(0);
    expect(median([0.5])).toBe(0.5);
    expect(median([0.1, 0.9, 0.5])).toBe(0.5);
    expect(median([0.1, 0.9])).toBe(0.5);
  });
});

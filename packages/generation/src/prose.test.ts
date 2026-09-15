import { describe, expect, it } from "vitest";
import { proseWordShare } from "./prose";
import { sufficientCandidateA, renderDistinct, renderProseHeavy } from "./fixtures/test-fixture";
import type { ScoredCandidate } from "./completeness";

const scored: ScoredCandidate = { ...sufficientCandidateA, completeness: 1 };

describe("proseWordShare (BUILD.md §7.2 prose-ratio check)", () => {
  it("stays well under the real template's maxProseWordShare for a normal draft", () => {
    const draft = renderDistinct(scored);
    expect(proseWordShare(draft)).toBeLessThan(0.4);
  });

  it("exceeds maxProseWordShare when the interpretation block dominates the page", () => {
    const draft = renderProseHeavy(scored);
    expect(proseWordShare(draft)).toBeGreaterThan(0.4);
  });

  it("returns 0 for a draft with no words anywhere", () => {
    expect(proseWordShare({ url: "/x", entityId: "1", blocks: {} })).toBe(0);
  });

  it("returns 0 when interpretation is empty but other blocks have content", () => {
    expect(proseWordShare({ url: "/x", entityId: "1", blocks: { answer: "some words here" } })).toBe(0);
  });
});

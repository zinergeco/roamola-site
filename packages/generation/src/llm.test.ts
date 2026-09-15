import { describe, expect, it } from "vitest";
import { buildPrompt, checkClaimsAgainstFacts, hashPrompt, type Fact } from "./llm";

const facts: Fact[] = [
  { label: "average daily rate", value: 120, sourceId: 1, observedAt: "2026-06-01T00:00:00Z" },
  { label: "average sea temperature", value: "22.5c", sourceId: 2, observedAt: "2026-06-01T00:00:00Z" },
];

// BUILD.md §14's protected contract test, verbatim:
//   test('LLM output contains no claim absent from `facts`', ...)
describe("LLM output contains no claim absent from `facts`", () => {
  it("passes text that only restates numbers present in facts", () => {
    const text = "The average daily rate here is 120, and the sea runs about 22.5c in 2026.";
    expect(checkClaimsAgainstFacts(text, facts)).toEqual([]);
  });

  it("flags a number with no matching fact", () => {
    const text = "The average daily rate here is 999.";
    const violations = checkClaimsAgainstFacts(text, facts);
    expect(violations.length).toBeGreaterThan(0);
    expect(violations[0]).toMatch(/999/);
  });

  it("allows a fact's year to be cited", () => {
    const text = "Data collected in 2026 shows a rate near 120.";
    expect(checkClaimsAgainstFacts(text, facts)).toEqual([]);
  });

  it("passes text with no numbers at all", () => {
    expect(checkClaimsAgainstFacts("This place has a mild climate.", facts)).toEqual([]);
  });

  it("passes an empty fact list only for text with no numbers", () => {
    expect(checkClaimsAgainstFacts("No figures here.", [])).toEqual([]);
    expect(checkClaimsAgainstFacts("A figure: 42.", [])).not.toEqual([]);
  });
});

describe("buildPrompt", () => {
  it("includes every fact and every constraint, and states the no-new-claims rule", () => {
    const prompt = buildPrompt({ template: "destination", block: "interpretation", facts, constraints: ["max 60 words"] });
    expect(prompt).toContain("average daily rate");
    expect(prompt).toContain("source #1");
    expect(prompt).toContain("max 60 words");
    expect(prompt.toLowerCase()).toContain("do not introduce");
  });
});

describe("hashPrompt", () => {
  it("is deterministic for the same prompt", () => {
    expect(hashPrompt("abc")).toBe(hashPrompt("abc"));
  });

  it("differs for different prompts", () => {
    expect(hashPrompt("abc")).not.toBe(hashPrompt("abd"));
  });
});

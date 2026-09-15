import { describe, expect, it } from "vitest";
import { defineTemplate } from "./define";
import destination from "./templates/destination";

// BUILD.md §14's protected test list, verbatim:
//   test('regulatory templates have reviewSampleRate === 1.0', ...)
describe("regulatory templates have reviewSampleRate === 1.0", () => {
  it("rejects defining a rules-* template with reviewSampleRate !== 1.0", () => {
    expect(() =>
      defineTemplate({
        ...destination,
        id: "rules-entry",
        reviewSampleRate: 0.05,
      }),
    ).toThrow(/reviewSampleRate/);
  });

  it("accepts a rules-* template with reviewSampleRate === 1.0", () => {
    expect(() =>
      defineTemplate({
        ...destination,
        id: "rules-entry",
        reviewSampleRate: 1.0,
      }),
    ).not.toThrow();
  });

  it("leaves non-regulatory templates alone", () => {
    expect(destination.reviewSampleRate).toBe(0.05);
  });
});

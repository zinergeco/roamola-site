import { beforeEach, describe, expect, it, vi } from "vitest";
import { BatchRejected, CapExceeded, generateBatch, runGates, sampleForReview } from "./pipeline";
import {
  sufficientCandidateA,
  sufficientCandidateB,
  insufficientCandidate,
  inheritedOnlyCandidate,
  renderDistinct,
  renderBoilerplate,
  renderProseHeavy,
  template,
} from "./fixtures/test-fixture";
import type { ScoredCandidate } from "./completeness";
import type { Candidate } from "./completeness";
import type { DraftResult } from "./pipeline";

describe("runGates (BUILD.md §7.2, the three gates in order)", () => {
  it("rolls up an insufficient candidate instead of rendering it", () => {
    const result = runGates([insufficientCandidate], template, renderDistinct);
    expect(result.rolledUp).toHaveLength(1);
    expect(result.rolledUp[0].candidate.entityId).toBe(insufficientCandidate.entityId);
    expect(result.passed).toHaveLength(0);
  });

  it("rolls up a candidate whose only shortfall is the unique-data penalty", () => {
    const result = runGates([inheritedOnlyCandidate], template, renderDistinct);
    expect(result.rolledUp).toHaveLength(1);
  });

  it("passes sufficient, distinct candidates through all three gates", () => {
    const result = runGates([sufficientCandidateA, sufficientCandidateB], template, renderDistinct);
    expect(result.rolledUp).toHaveLength(0);
    expect(result.passed).toHaveLength(2);
    expect(result.passed[0].candidate.completeness).toBe(1);
  });

  it("splits a mixed batch correctly -- sufficient candidates pass, insufficient ones roll up", () => {
    const result = runGates([sufficientCandidateA, insufficientCandidate, sufficientCandidateB], template, renderDistinct);
    expect(result.passed).toHaveLength(2);
    expect(result.rolledUp).toHaveLength(1);
  });

  it("rejects a batch of boilerplate siblings -- Gate 2, differentiation", () => {
    expect(() => runGates([sufficientCandidateA, sufficientCandidateB], template, renderBoilerplate)).toThrow(BatchRejected);
  });

  it("rejects a draft whose prose share exceeds maxProseWordShare", () => {
    expect(() => runGates([sufficientCandidateA], template, renderProseHeavy)).toThrow(BatchRejected);
  });

  it("does not reject a single-candidate batch on similarity grounds (nothing to compare against)", () => {
    const result = runGates([sufficientCandidateA], template, renderDistinct);
    expect(result.passed).toHaveLength(1);
  });
});

describe("sampleForReview (BUILD.md §7.2 enqueueForReview)", () => {
  function fakePassed(n: number): DraftResult[] {
    return Array.from({ length: n }, (_, i) => ({
      candidate: { ...sufficientCandidateA, entityId: String(i), url: `/places/zz/x/city-${i}` } as ScoredCandidate,
      draft: { url: `/places/zz/x/city-${i}`, entityId: String(i), blocks: {} },
      similarity: 0,
    }));
  }

  it("selects everything at reviewSampleRate 1.0 (regulatory templates)", () => {
    const drafts = fakePassed(10);
    expect(sampleForReview(drafts, 1.0).size).toBe(10);
  });

  it("selects nothing at reviewSampleRate 0", () => {
    const drafts = fakePassed(10);
    expect(sampleForReview(drafts, 0).size).toBe(0);
  });

  it("selects roughly reviewSampleRate of a large batch", () => {
    const drafts = fakePassed(200);
    const selected = sampleForReview(drafts, 0.05);
    expect(selected.size).toBeGreaterThanOrEqual(9);
    expect(selected.size).toBeLessThanOrEqual(11);
  });

  it("is deterministic -- same input, same selection every time", () => {
    const drafts = fakePassed(50);
    const a = sampleForReview(drafts, 0.1);
    const b = sampleForReview(drafts, 0.1);
    expect([...a].map((d) => d.draft.url)).toEqual([...b].map((d) => d.draft.url));
  });
});

describe("generateBatch (BUILD.md §7.2 entrypoint, env-gated)", () => {
  const baseDeps = {
    findCandidates: vi.fn(async (_t, _l) => [sufficientCandidateA] as Candidate[]),
    render: renderDistinct,
    persistRollup: vi.fn(async () => {}),
    persistDraft: vi.fn(async () => {}),
    publishedThisMonth: vi.fn(async () => 0),
  };

  beforeEach(() => {
    vi.unstubAllEnvs();
    baseDeps.findCandidates.mockClear();
    baseDeps.persistRollup.mockClear();
    baseDeps.persistDraft.mockClear();
    baseDeps.publishedThisMonth.mockClear();
  });

  it("refuses to run when GENERATION_ENABLED is not 'true' -- BUILD.md §3's kill switch", async () => {
    vi.stubEnv("GENERATION_ENABLED", "false");
    await expect(generateBatch(template, 10, baseDeps)).rejects.toThrow(/GENERATION_ENABLED/);
    expect(baseDeps.findCandidates).not.toHaveBeenCalled();
  });

  it("refuses to run with no GENERATION_DAILY_CAP set", async () => {
    vi.stubEnv("GENERATION_ENABLED", "true");
    vi.stubEnv("GENERATION_DAILY_CAP", "");
    await expect(generateBatch(template, 10, baseDeps)).rejects.toThrow(/GENERATION_DAILY_CAP/);
  });

  it("refuses a batch larger than GENERATION_DAILY_CAP", async () => {
    vi.stubEnv("GENERATION_ENABLED", "true");
    vi.stubEnv("GENERATION_DAILY_CAP", "5");
    await expect(generateBatch(template, 10, baseDeps)).rejects.toThrow(/GENERATION_DAILY_CAP/);
  });

  it("enforces the release-stage publish cap with no override (BUILD.md §7.5)", async () => {
    vi.stubEnv("GENERATION_ENABLED", "true");
    vi.stubEnv("GENERATION_DAILY_CAP", "1000");
    vi.stubEnv("RELEASE_STAGE", "pilot"); // cap 200
    const deps = { ...baseDeps, publishedThisMonth: vi.fn(async () => 195) };
    await expect(generateBatch(template, 10, deps)).rejects.toThrow(CapExceeded);
  });

  it("runs end to end when enabled, under cap, and persists rollups + drafts", async () => {
    vi.stubEnv("GENERATION_ENABLED", "true");
    vi.stubEnv("GENERATION_DAILY_CAP", "1000");
    vi.stubEnv("RELEASE_STAGE", "pilot");
    const deps = {
      ...baseDeps,
      findCandidates: vi.fn(async () => [sufficientCandidateA, insufficientCandidate] as Candidate[]),
    };
    const count = await generateBatch(template, 10, deps);
    expect(count).toBe(1); // only the sufficient one passes
    expect(deps.persistRollup).toHaveBeenCalledTimes(1);
    expect(deps.persistDraft).toHaveBeenCalledTimes(1);
  });
});

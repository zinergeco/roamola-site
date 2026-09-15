/**
 * BUILD.md §7.2: "This is the most important subsystem in the build.
 * Implement it before any template." The gates run in the order the spec
 * lists them, for the reason it gives -- Gate 1 (data sufficiency) runs
 * before anything is rendered, so an insufficient candidate never reaches
 * an LLM call; the prose-ratio check runs on rendered drafts, after Gate 2,
 * because it needs the rendered text.
 *
 * `runGates` is pure -- no Postgres, no env vars, no model calls -- so it
 * can be (and is, in pipeline.test.ts) unit-tested directly against
 * synthetic candidates, the same way `services/pipelines/lib/anomaly.py`'s
 * `check_batch` is tested without a live database. `generateBatch` is the
 * real, BUILD.md-§7.2-shaped entrypoint: it enforces the env-var kill
 * switches, calls out to injected (normally Postgres-backed) dependencies,
 * and calls `runGates` in the middle.
 */

import type { TemplateDefinition } from "./define";
import { scoreCompleteness, type Candidate, type ScoredCandidate } from "./completeness";
import type { Draft } from "./draft";
import { computeSiblingSimilarity, median } from "./similarity";
import { proseWordShare } from "./prose";

export class BatchRejected extends Error {}

export interface RollupRecord {
  candidate: Candidate;
  completeness: number;
  templateId: string;
}

export interface DraftResult {
  candidate: ScoredCandidate;
  draft: Draft;
  similarity: number;
}

export interface GateResult {
  /** Candidates that scored below `minCompleteness` -- rolled into the parent page, never rendered. */
  rolledUp: RollupRecord[];
  /** Candidates that passed all three gates (sufficiency, differentiation, prose ratio) and are eligible for the review queue. */
  passed: DraftResult[];
}

/**
 * BUILD.md §7.2's `generateBatch`, minus the env checks and I/O -- the
 * three gates, in order, over an already-fetched candidate list and an
 * already-provided render function. Throws `BatchRejected` exactly where
 * the spec's pseudocode throws it: when the whole batch is boilerplate, or
 * when any single draft blows the prose-ratio budget.
 */
export function runGates(
  candidates: Candidate[],
  template: TemplateDefinition,
  render: (candidate: ScoredCandidate) => Draft,
): GateResult {
  // GATE 1 -- data sufficiency
  const rolledUp: RollupRecord[] = [];
  const sufficient: ScoredCandidate[] = [];
  for (const candidate of candidates) {
    const completeness = scoreCompleteness(candidate, template);
    if (completeness < template.minCompleteness) {
      rolledUp.push({ candidate, completeness, templateId: template.id });
      continue;
    }
    sufficient.push({ ...candidate, completeness });
  }

  const drafts = sufficient.map((candidate) => ({ candidate, draft: render(candidate) }));

  // GATE 2 -- differentiation. Only meaningful with >1 sibling; a lone
  // candidate can't be boilerplate relative to nothing.
  const similarities = drafts.length > 1 ? computeSiblingSimilarity(drafts.map((d) => d.draft)) : drafts.map(() => 0);
  if (drafts.length > 1 && median(similarities) > template.maxSiblingSimilarity) {
    throw new BatchRejected(
      `template "${template.id}" producing boilerplate -- median sibling similarity ` +
        `${median(similarities)} exceeds maxSiblingSimilarity ${template.maxSiblingSimilarity}`,
    );
  }

  // Prose ratio check -- must run on every draft that survived Gate 2.
  for (const { draft } of drafts) {
    const share = proseWordShare(draft);
    if (share > template.maxProseWordShare) {
      throw new BatchRejected(
        `prose ratio ${share} exceeds maxProseWordShare ${template.maxProseWordShare} on ${draft.url}`,
      );
    }
  }

  const passed: DraftResult[] = drafts.map(({ candidate, draft }, i) => ({
    candidate,
    draft,
    similarity: similarities[i],
  }));

  return { rolledUp, passed };
}

/**
 * BUILD.md §7.2's `enqueueForReview(drafts, template.reviewSampleRate)`,
 * made concrete: deterministic sampling (every Nth draft, by url sort
 * order) rather than `Math.random()`, so a given batch always selects the
 * same drafts for review -- reproducibility matters more here than true
 * randomness, and it's what makes this testable at all. Regulatory
 * templates (`reviewSampleRate === 1.0`, enforced at definition time in
 * define.ts) always select everything.
 */
export function sampleForReview(drafts: DraftResult[], reviewSampleRate: number): Set<DraftResult> {
  if (reviewSampleRate >= 1) return new Set(drafts);
  if (reviewSampleRate <= 0) return new Set();
  const sorted = [...drafts].sort((a, b) => a.draft.url.localeCompare(b.draft.url));
  const step = 1 / reviewSampleRate;
  const selected = new Set<DraftResult>();
  let next = 0;
  for (let i = 0; i < sorted.length; i++) {
    if (i >= next) {
      selected.add(sorted[i]);
      next += step;
    }
  }
  return selected;
}

export interface GenerateBatchDeps {
  findCandidates: (template: TemplateDefinition, limit: number) => Promise<Candidate[]>;
  render: (candidate: ScoredCandidate) => Draft;
  persistRollup: (record: RollupRecord) => Promise<void>;
  persistDraft: (result: DraftResult, selectedForReview: boolean) => Promise<void>;
  publishedThisMonth: (templateId: string) => Promise<number>;
}

/** BUILD.md §7.5's release-stage caps, keyed by `RELEASE_STAGE`. No override flag, per the spec. */
const STAGE_CAPS: Record<string, number> = {
  pilot: 200,
  expansion: 2000,
  scale: 10000,
  full: 25000,
};

export class CapExceeded extends Error {}

function currentStage(): string {
  return process.env.RELEASE_STAGE ?? "pilot";
}

function stageCap(stage: string): number {
  const cap = STAGE_CAPS[stage];
  if (cap == null) throw new Error(`unknown RELEASE_STAGE "${stage}" -- must be one of ${Object.keys(STAGE_CAPS).join(", ")}`);
  return cap;
}

/**
 * BUILD.md §7.2's real entrypoint. `GENERATION_ENABLED` and
 * `GENERATION_DAILY_CAP` are checked first and unconditionally -- BUILD.md
 * §3 is explicit these are never flipped by a deploy script, so this
 * function has to fail closed by default, the same way `lib/provenance.py`
 * fails closed with no `DATABASE_URL`.
 */
export async function generateBatch(
  template: TemplateDefinition,
  limit: number,
  deps: GenerateBatchDeps,
): Promise<number> {
  if (process.env.GENERATION_ENABLED !== "true") {
    throw new Error("GENERATION_ENABLED is not 'true' -- generation is off by default, on purpose (BUILD.md §3)");
  }
  const dailyCap = Number(process.env.GENERATION_DAILY_CAP ?? "");
  if (!Number.isFinite(dailyCap) || dailyCap <= 0) {
    throw new Error("GENERATION_DAILY_CAP is not set to a positive number");
  }
  if (limit > dailyCap) {
    throw new Error(`requested batch size ${limit} exceeds GENERATION_DAILY_CAP ${dailyCap}`);
  }

  const stage = currentStage();
  const publishedThisMonth = await deps.publishedThisMonth(template.id);
  if (publishedThisMonth + limit > stageCap(stage)) {
    throw new CapExceeded(
      `publishing ${limit} more would exceed the "${stage}" stage cap of ${stageCap(stage)} ` +
        `(${publishedThisMonth} already this month)`,
    );
  }

  const candidates = await deps.findCandidates(template, limit);
  const { rolledUp, passed } = runGates(candidates, template, deps.render);

  for (const rollup of rolledUp) {
    await deps.persistRollup(rollup);
  }

  const selected = sampleForReview(passed, template.reviewSampleRate);
  for (const result of passed) {
    await deps.persistDraft(result, selected.has(result));
  }

  return passed.length;
}

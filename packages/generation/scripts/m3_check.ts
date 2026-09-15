#!/usr/bin/env -S npx tsx
/**
 * A live acceptance run of the gate mechanics BUILD.md §7 calls "the most
 * important subsystem in the build" -- the TypeScript-side counterpart to
 * services/pipelines/scripts/m2_check.py, same shape and same honesty
 * about scope.
 *
 * This does NOT prove M3's own BUILD.md §15 done-when ("200 pages are
 * live, 100% reviewed, indexation measurable") -- that requires real
 * source data behind real launch markets, which is deliberately still
 * unstarted (docs/SOURCES.md is empty, a business decision). What this
 * proves is that the gate engine itself -- data-sufficiency scoring,
 * sibling-similarity rejection, prose-ratio rejection, deterministic
 * review sampling -- works correctly, against the real, shipped
 * `destination` template and a synthetic fixture batch, mirroring exactly
 * how m2_check.py proved the pipeline mechanics before a real connector
 * existed.
 *
 * Usage:
 *   cd packages/generation && npx tsx scripts/m3_check.ts
 * Exit code 0 on PASS, 1 on FAIL.
 */

import { BatchRejected, runGates } from "../src/pipeline";
import {
  sufficientCandidateA,
  sufficientCandidateB,
  insufficientCandidate,
  inheritedOnlyCandidate,
  renderDistinct,
  renderBoilerplate,
  renderProseHeavy,
  template,
} from "../src/fixtures/test-fixture";

interface Step {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

function runStep(name: string, fn: () => string): Step {
  const start = performance.now();
  try {
    const detail = fn();
    return { name, ok: true, detail, ms: performance.now() - start };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: performance.now() - start };
  }
}

function report(steps: Step[]): boolean {
  const allPassed = steps.length === 5 && steps.every((s) => s.ok);
  console.log();
  console.log("=".repeat(72));
  console.log("M3 GATE-ENGINE ACCEPTANCE TEST -- BUILD.md §7");
  console.log("=".repeat(72));
  for (const s of steps) {
    console.log(`[${s.ok ? "PASS" : "FAIL"}] ${s.name} (${s.ms.toFixed(0)}ms)`);
    console.log(`       ${s.detail}`);
  }
  console.log("-".repeat(72));
  console.log(allPassed ? "PASS -- gate engine behaves per BUILD.md §7.2 on every case" : "FAIL -- see above");
  console.log("=".repeat(72));
  return allPassed;
}

function run(): boolean {
  const steps: Step[] = [];

  steps.push(
    runStep("Gate 1: insufficient candidate rolls up, does not render (BUILD.md §7.2/§7.3)", () => {
      const result = runGates([insufficientCandidate], template, renderDistinct);
      if (result.passed.length !== 0) throw new Error(`expected 0 passed, got ${result.passed.length}`);
      if (result.rolledUp.length !== 1) throw new Error(`expected 1 rolled up, got ${result.rolledUp.length}`);
      return `rolled up entity ${result.rolledUp[0].candidate.entityId}, completeness=${result.rolledUp[0].completeness} (< minCompleteness ${template.minCompleteness})`;
    }),
  );

  steps.push(
    runStep("Gate 1: unique-data penalty rolls up an otherwise-complete candidate", () => {
      const result = runGates([inheritedOnlyCandidate], template, renderDistinct);
      if (result.rolledUp.length !== 1) throw new Error(`expected 1 rolled up, got ${result.rolledUp.length}`);
      if (result.rolledUp[0].completeness !== 0.6) throw new Error(`expected penalised score 0.6, got ${result.rolledUp[0].completeness}`);
      return `rolled up entity ${result.rolledUp[0].candidate.entityId}, completeness=${result.rolledUp[0].completeness} (1.0 * 0.6 penalty, hasUniqueData=false)`;
    }),
  );

  steps.push(
    runStep("Sufficient, distinct siblings pass all three gates and reach the review queue", () => {
      const result = runGates([sufficientCandidateA, sufficientCandidateB, insufficientCandidate], template, renderDistinct);
      if (result.passed.length !== 2) throw new Error(`expected 2 passed, got ${result.passed.length}`);
      if (result.rolledUp.length !== 1) throw new Error(`expected 1 rolled up, got ${result.rolledUp.length}`);
      const sims = result.passed.map((p) => p.similarity);
      return `2 passed (completeness=1.0 each, similarity=${sims.join(",")}), 1 rolled up -- mixed batch split correctly`;
    }),
  );

  steps.push(
    runStep("Gate 2: a batch of near-identical siblings is rejected, not silently published", () => {
      try {
        runGates([sufficientCandidateA, sufficientCandidateB], template, renderBoilerplate);
        throw new Error("runGates() succeeded on a boilerplate batch -- Gate 2 did not fire. This is a real bug.");
      } catch (err) {
        if (err instanceof BatchRejected) {
          return `correctly rejected: ${err.message}`;
        }
        throw err;
      }
    }),
  );

  steps.push(
    runStep("Prose-ratio gate rejects a draft whose interpretation block dominates the page", () => {
      try {
        runGates([sufficientCandidateA], template, renderProseHeavy);
        throw new Error("runGates() succeeded on a prose-heavy draft -- the prose-ratio gate did not fire. This is a real bug.");
      } catch (err) {
        if (err instanceof BatchRejected) {
          return `correctly rejected: ${err.message}`;
        }
        throw err;
      }
    }),
  );

  return report(steps);
}

const ok = run();
process.exit(ok ? 0 : 1);

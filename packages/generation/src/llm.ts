/**
 * BUILD.md §8.5. All model calls go through this one service -- app code
 * (and pipeline code) never calls the Anthropic API directly. That's what
 * makes a bad prompt or a bad model version reversible in bulk later:
 * query pages by generation_meta.promptHash, not by re-reading every page.
 *
 * `buildPrompt`, `hashPrompt`, and `checkClaimsAgainstFacts` are real,
 * pure, no-I/O functions -- there's no reason they should stay stubs, and
 * `checkClaimsAgainstFacts` in particular is (the module's own original
 * comment says it best) "the single most safety-critical piece of code in
 * the generation package."
 *
 * `callModel` is the one function still deliberately unimplemented. Wiring
 * up a real model call is a credentialed infrastructure decision -- which
 * provider, which API key, real per-call cost -- the same category of
 * decision `DATABASE_URL`/`S3_*` were for M2, not something to do
 * implicitly while building the gate that calls it. It's also gated behind
 * `GENERATION_ENABLED`, off by default (BUILD.md §3), so nothing here can
 * spend money until that's a deliberate choice.
 */

import { createHash } from "node:crypto";

export interface Fact {
  label: string;
  value: string | number;
  sourceId: number;
  observedAt: string;
}

export interface GenerateBlockInput {
  template: string;
  block: "interpretation" | "summary" | "translation";
  facts: Fact[]; // ONLY facts already in the graph, each with a source_id
  constraints: string[];
}

export interface GenerationMeta {
  model: string;
  promptHash: string;
  generatedAt: string;
}

export class UngroundedClaim extends Error {
  constructor(public violations: string[]) {
    super(`Generated text contains claims absent from the supplied facts: ${violations.join("; ")}`);
  }
}

const MODEL_ID = process.env.GENERATION_MODEL_ID ?? "claude-sonnet-5";

export async function generateBlock(
  input: GenerateBlockInput,
): Promise<{ text: string; meta: GenerationMeta }> {
  // Contract (BUILD.md §8.5):
  // - The model may only restate, compare and explain the facts passed in.
  // - It may not introduce a number, name, date or claim not present in `facts`.
  // - Output is validated against `facts` before return.
  if (process.env.GENERATION_ENABLED !== "true") {
    throw new Error("GENERATION_ENABLED is not 'true' -- generation is off by default, on purpose");
  }

  const prompt = buildPrompt(input);
  const result = await callModel(prompt);
  const violations = checkClaimsAgainstFacts(result.text, input.facts);
  if (violations.length) throw new UngroundedClaim(violations);

  return {
    text: result.text,
    meta: { model: MODEL_ID, promptHash: hashPrompt(prompt), generatedAt: new Date().toISOString() },
  };
}

export function buildPrompt(input: GenerateBlockInput): string {
  const factLines = input.facts.length
    ? input.facts.map((f) => `- ${f.label}: ${f.value} (source #${f.sourceId}, observed ${f.observedAt})`).join("\n")
    : "(none)";
  const constraintLines = input.constraints.length ? input.constraints.map((c) => `- ${c}`).join("\n") : "(none)";

  return [
    `You are writing the "${input.block}" block of a "${input.template}" page.`,
    "You may ONLY restate, compare, and explain the facts listed below.",
    "Do not introduce any number, name, date, or claim that is not listed here -- every",
    "figure you use must come from this list, verbatim or as a direct restatement.",
    "",
    "Facts:",
    factLines,
    "",
    "Constraints:",
    constraintLines,
  ].join("\n");
}

async function callModel(_prompt: string): Promise<{ text: string }> {
  // Deliberately unimplemented -- see the module docstring. Wiring this up
  // is a real infrastructure decision (provider, API key, per-call cost),
  // not something to do implicitly here.
  throw new Error(
    "callModel() is not implemented -- wiring up a real model provider is a deliberate " +
      "infrastructure decision, not made yet (see llm.ts's module docstring)",
  );
}

/**
 * BUILD.md §14's protected contract test: "LLM output contains no claim
 * absent from `facts`." Heuristic, not NLP -- extracts every number-like
 * token from the generated text and rejects any that doesn't match a
 * number appearing in `facts` (as a fact's own numeric value, or a number
 * embedded in a string fact, or the year of an `observedAt` date, which is
 * a legitimate thing to cite). Deliberately conservative: false positives
 * (rejecting an honestly-derived number, e.g. a correct sum of two facts)
 * are an acceptable cost for a grounding check whose whole job is to fail
 * closed, the same trade `lib/anomaly.py`'s threshold rules make in
 * services/pipelines.
 */
export function checkClaimsAgainstFacts(text: string, facts: Fact[]): string[] {
  const allowedNumbers = new Set<string>();
  for (const fact of facts) {
    if (typeof fact.value === "number") {
      allowedNumbers.add(String(fact.value));
      allowedNumbers.add(fact.value.toFixed(0));
      allowedNumbers.add(fact.value.toFixed(1));
      allowedNumbers.add(fact.value.toFixed(2));
    } else {
      for (const n of extractNumbers(fact.value)) allowedNumbers.add(n);
    }
    const year = fact.observedAt?.slice(0, 4);
    if (year && /^\d{4}$/.test(year)) allowedNumbers.add(year);
  }

  const violations: string[] = [];
  for (const n of extractNumbers(text)) {
    if (!allowedNumbers.has(n) && !allowedNumbers.has(String(Number(n)))) {
      violations.push(`number "${n}" in generated text has no matching fact value`);
    }
  }
  return violations;
}

function extractNumbers(text: string): string[] {
  return text.match(/-?\d+(\.\d+)?/g) ?? [];
}

export function hashPrompt(prompt: string): string {
  return createHash("sha256").update(prompt).digest("hex");
}

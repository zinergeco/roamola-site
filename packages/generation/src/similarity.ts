/**
 * BUILD.md §7.2, Gate 2: "computeSiblingSimilarity(drafts) -- embeddings,
 * cosine" (the spec's own comment).
 *
 * This is deliberately NOT real embeddings. A real embedding needs a model
 * call, and wiring up a model provider is the same kind of deliberate,
 * credentialed infrastructure decision `DATABASE_URL`/`S3_*` were for M2 --
 * not something to do implicitly while building the gate that consumes it.
 * `llm.ts`'s `callModel()` is left unimplemented for the same reason.
 *
 * What's here instead is a real, deterministic, unit-testable stand-in:
 * bag-of-words term-frequency cosine similarity over each draft's
 * `interpretation` block (the one block that's ever LLM-written -- BUILD.md
 * §7.2's own comment on `renderDraft`). It correctly catches the case
 * Gate 2 exists to catch -- a template whose drafts are near-identical
 * boilerplate -- and it can be swapped for a real embeddings call later
 * without changing anything in `pipeline.ts`, since the call signature
 * (`Draft[] -> number[]`) doesn't change.
 */

import type { Draft } from "./draft";

function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

function termFrequencyVector(text: string): Map<string, number> {
  const freq = new Map<string, number>();
  for (const tok of tokenize(text)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
  return freq;
}

function cosineSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (const v of a.values()) normA += v * v;
  for (const v of b.values()) normB += v * v;
  if (normA === 0 || normB === 0) return 0;
  for (const [term, va] of a) {
    const vb = b.get(term);
    if (vb) dot += va * vb;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * Returns one similarity score per draft -- its highest cosine similarity
 * against any *other* draft in the same batch. BUILD.md §7.2 takes
 * `median(similarities)` of whatever this returns and rejects the whole
 * batch above `template.maxSiblingSimilarity`.
 */
export function computeSiblingSimilarity(drafts: Draft[]): number[] {
  const vectors = drafts.map((d) => termFrequencyVector(d.blocks.interpretation ?? ""));
  return vectors.map((v, i) => {
    let maxSim = 0;
    for (let j = 0; j < vectors.length; j++) {
      if (i === j) continue;
      const sim = cosineSimilarity(v, vectors[j]);
      if (sim > maxSim) maxSim = sim;
    }
    return round3(maxSim);
  });
}

export function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

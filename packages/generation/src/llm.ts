/**
 * BUILD.md §8.5. All model calls go through this one service -- app code
 * (and pipeline code) never calls the Anthropic API directly. That's what
 * makes a bad prompt or a bad model version reversible in bulk later:
 * query pages by generation_meta.promptHash, not by re-reading every page.
 */

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

function buildPrompt(input: GenerateBlockInput): string {
  // TODO(M3): real prompt construction once the destination template's
  // interpretation block is being built end to end.
  throw new Error("not implemented");
}

async function callModel(_prompt: string): Promise<{ text: string }> {
  throw new Error("not implemented");
}

function checkClaimsAgainstFacts(_text: string, _facts: Fact[]): string[] {
  // TODO(M3): numeric/date/name extraction + cross-check against `facts`.
  // This function is the single most safety-critical piece of code in the
  // generation package -- see the protected test in BUILD.md §14:
  // "LLM output contains no claim absent from `facts`".
  throw new Error("not implemented");
}

function hashPrompt(_prompt: string): string {
  throw new Error("not implemented");
}

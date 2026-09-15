/**
 * BUILD.md §7.2's prose-ratio check: "interpretation" is the only block an
 * LLM ever writes; every other block is a data render (tables, embedded
 * tool, source list). If the interpretation block dominates a page's word
 * count, that's a sign the template is leaning on generated prose instead
 * of the actual data graph -- which is exactly what §7's whole gate system
 * exists to prevent.
 */

import type { Draft } from "./draft";

function wordCount(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Fraction of a draft's total word count that comes from its `interpretation` block. */
export function proseWordShare(draft: Draft): number {
  const totalWords = Object.values(draft.blocks).reduce((sum, text) => sum + wordCount(text ?? ""), 0);
  if (totalWords === 0) return 0;
  const proseWords = wordCount(draft.blocks.interpretation ?? "");
  return Math.round((proseWords / totalWords) * 1000) / 1000;
}

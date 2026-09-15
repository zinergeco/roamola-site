/**
 * A rendered page draft, pre-gate-2/3. Deliberately separate from
 * `define.ts`'s `blocks` list (which just names the required block
 * *types*) -- this is the actual rendered text per block, which is what
 * the similarity and prose-ratio gates need to inspect.
 */

import type { TemplateDefinition } from "./define";

export interface Draft {
  url: string;
  entityId: string;
  /** Rendered text per block, keyed by block name (BUILD.md §7.1's `blocks` list). Data-render blocks (evidence, practical, tool, sources, related) are typically templated strings, not prose; `interpretation` is the only block an LLM ever writes (BUILD.md §7.2's own comment). */
  blocks: Partial<Record<TemplateDefinition["blocks"][number], string>>;
}

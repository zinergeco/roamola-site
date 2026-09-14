/**
 * Template definition type -- BUILD.md §7.1. This is the most important
 * subsystem in the build (the spec's own words): implement and test this,
 * and the gates in pipeline.ts, before writing a single page template.
 */

export interface TemplateDefinition {
  id: string;
  entityType: "place" | "property" | "experience" | "route";
  entityFilter: Record<string, unknown>;
  urlPattern: string;

  // Gate 1 -- data sufficiency
  requiredFields: string[];
  minObservations: Record<string, number>;
  maxAgeDays: Record<string, number>;
  minCompleteness: number;
  requiresUniqueData: string[];

  // Gate 2 -- differentiation
  maxSiblingSimilarity: number;

  // Content contract -- enforced, not advisory
  blocks: Array<
    "answer" | "evidence" | "interpretation" | "practical" | "tool" | "sources" | "related"
  >;
  maxProseWordShare: number; // hard fail above this (target <= 0.40, BUILD.md §7)
  reviewSampleRate: number; // regulatory templates MUST set this to 1.0
}

export function defineTemplate(def: TemplateDefinition): TemplateDefinition {
  // Belt-and-braces: regulatory topic templates always get 100% review,
  // no matter what a template author sets. BUILD.md §7.1 says this is
  // "non-negotiable, asserted in a test" -- assert it here too, at
  // definition time, so a bad template can't even be registered.
  if (def.id.startsWith("rules-") && def.reviewSampleRate !== 1.0) {
    throw new Error(
      `Template "${def.id}" looks regulatory but reviewSampleRate is ${def.reviewSampleRate}, not 1.0`,
    );
  }
  return def;
}

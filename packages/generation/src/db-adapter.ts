/**
 * Real Postgres-backed `GenerateBatchDeps` for the `destination` template
 * -- BUILD.md §15's M3 scope is `destination` end to end, not a generic
 * candidate-finder for all eleven future templates (docs/TEMPLATES.md is
 * explicit only `destination` and `entry rules` are M3/Phase-0 work). A
 * second template gets a sibling adapter when it's actually built.
 *
 * This is real, type-checked, compiles-against-the-real-schema code, the
 * same as `services/pipelines/lib/provenance.py` was before M2 was ever
 * deployed -- but it has NOT been run live yet, deliberately: running it
 * would write `page` rows for a template that has zero real underlying
 * source data (docs/SOURCES.md is still empty), which is exactly the kind
 * of thing BUILD.md §0 rule 2 exists to prevent ("no orphan data enters
 * the graph"). The gate mechanics are proven instead against
 * `fixtures/test-fixture.ts`'s synthetic candidates (see
 * `scripts/m3_check.ts`), the same division M2 drew between
 * `test_fixture.py` (proves the mechanics) and a real connector (doesn't
 * exist yet, on purpose).
 */

import { and, eq, gte, inArray, sql } from "drizzle-orm";
import { db, page, place, property, signal } from "@roamola/db";
import type { TemplateDefinition } from "./define";
import type { Candidate, FieldObservation } from "./completeness";
import type { DraftResult, GenerateBatchDeps, RollupRecord } from "./pipeline";

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function ageDaysFrom(observedAt: Date | string): number {
  const ts = observedAt instanceof Date ? observedAt : new Date(observedAt);
  return Math.floor((Date.now() - ts.getTime()) / MS_PER_DAY);
}

export async function findDestinationCandidates(template: TemplateDefinition, limit: number): Promise<Candidate[]> {
  if (template.id !== "destination") {
    throw new Error(`findDestinationCandidates only supports the "destination" template, got "${template.id}"`);
  }
  const types = (template.entityFilter.type as string[] | undefined) ?? [];

  const places = await db
    .select({
      id: place.id,
      slug: place.slug,
      countryCode: place.countryCode,
      parentId: place.parentId,
    })
    .from(place)
    .where(types.length ? inArray(place.type, types) : sql`true`)
    .limit(limit);

  if (places.length === 0) return [];

  const placeIds = places.map((p) => p.id);
  const parentIds = [...new Set(places.map((p) => p.parentId).filter((id): id is bigint => id != null))];

  const [climateRows, priceRows, propertyRows, parentRows] = await Promise.all([
    db
      .select({ entityId: signal.entityId, count: sql<number>`count(*)`.mapWith(Number), latest: sql<string>`max(${signal.observedAt})` })
      .from(signal)
      .where(and(eq(signal.entityType, "place"), eq(signal.metric, "climate_monthly"), inArray(signal.entityId, placeIds)))
      .groupBy(signal.entityId),
    db
      .select({ entityId: signal.entityId, count: sql<number>`count(*)`.mapWith(Number), latest: sql<string>`max(${signal.observedAt})` })
      .from(signal)
      .where(and(eq(signal.entityType, "place"), eq(signal.metric, "price_band"), inArray(signal.entityId, placeIds)))
      .groupBy(signal.entityId),
    db
      .select({ placeId: property.placeId, count: sql<number>`count(*)`.mapWith(Number) })
      .from(property)
      .where(inArray(property.placeId, placeIds))
      .groupBy(property.placeId),
    parentIds.length
      ? db.select({ id: place.id, slug: place.slug }).from(place).where(inArray(place.id, parentIds))
      : Promise.resolve([] as Array<{ id: bigint; slug: string }>),
  ]);

  const climateByPlace = new Map(climateRows.map((r) => [r.entityId.toString(), r]));
  const priceByPlace = new Map(priceRows.map((r) => [r.entityId.toString(), r]));
  const propertyCountByPlace = new Map(propertyRows.map((r) => [r.placeId.toString(), r.count]));
  const parentSlugById = new Map(parentRows.map((r) => [r.id.toString(), r.slug]));

  return places.map((p): Candidate => {
    const id = p.id.toString();
    const climate = climateByPlace.get(id);
    const priceBand = priceByPlace.get(id);
    const propertyCount = propertyCountByPlace.get(id) ?? 0;
    const regionSlug = (p.parentId != null && parentSlugById.get(p.parentId.toString())) || p.countryCode.toLowerCase();

    const fields: Record<string, FieldObservation> = {
      "place.centroid": { present: true }, // NOT NULL in schema -- every place row has one
      "place.timezone": { present: true }, // NOT NULL in schema
      "signal.climate_monthly": {
        present: !!climate,
        observationCount: climate?.count ?? 0,
        ageDays: climate ? ageDaysFrom(climate.latest) : undefined,
      },
      "signal.price_band": {
        present: !!priceBand,
        observationCount: priceBand?.count ?? 0,
        ageDays: priceBand ? ageDaysFrom(priceBand.latest) : undefined,
      },
      "property.count": { present: propertyCount > 0, observationCount: propertyCount },
    };

    return {
      entityType: "place",
      entityId: id,
      url: template.urlPattern
        .replace("{country}", p.countryCode.toLowerCase())
        .replace("{region}", regionSlug)
        .replace("{slug}", p.slug),
      fields,
      // This schema has no parent-value-inheritance mechanism yet (a
      // place's signals/properties are always its own rows, never copied
      // from a parent), so there is nothing here to compare against --
      // always true until such a mechanism exists. The 0.6 penalty path
      // is exercised by the synthetic fixture instead (see
      // fixtures/test-fixture.ts), which deliberately marks a candidate
      // as inherited-only to prove the penalty logic itself works.
      hasUniqueData: true,
    };
  });
}

export async function persistRollup(record: RollupRecord): Promise<void> {
  // BUILD.md §7.2: an insufficient candidate "becomes a row on the parent
  // page instead" of getting its own page. There is no parent `destination`
  // page to attach to yet -- none has ever been generated (docs/SOURCES.md
  // is still empty) -- so there's genuinely nothing to write today. This
  // stays a real, callable function (not deleted) documenting exactly what
  // it will do once a parent page exists: look up the parent's `page` row
  // by (template, parent entity id), merge this candidate's summary into
  // `content.rollups`, and update it.
  void record;
}

export async function persistDraft(result: DraftResult, selectedForReview: boolean): Promise<void> {
  const values = {
    template: "destination",
    entityType: result.candidate.entityType,
    entityId: BigInt(result.candidate.entityId),
    url: result.draft.url,
    status: (selectedForReview ? "review" : "draft") as "review" | "draft",
    completenessScore: result.candidate.completeness.toFixed(3),
    similarityScore: result.similarity.toFixed(3),
    content: result.draft.blocks,
  };
  await db
    .insert(page)
    .values(values)
    .onConflictDoUpdate({
      target: page.url,
      set: {
        status: values.status,
        completenessScore: values.completenessScore,
        similarityScore: values.similarityScore,
        content: values.content,
      },
    });
}

export async function publishedThisMonth(templateId: string): Promise<number> {
  const monthStart = new Date();
  monthStart.setUTCDate(1);
  monthStart.setUTCHours(0, 0, 0, 0);
  const [row] = await db
    .select({ count: sql<number>`count(*)`.mapWith(Number) })
    .from(page)
    .where(and(eq(page.template, templateId), eq(page.status, "published"), gte(page.publishedAt, monthStart)));
  return row?.count ?? 0;
}

export const destinationDbDeps: Omit<GenerateBatchDeps, "render"> = {
  findCandidates: findDestinationCandidates,
  persistRollup,
  persistDraft,
  publishedThisMonth,
};

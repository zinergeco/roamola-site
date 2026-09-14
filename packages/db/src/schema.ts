/**
 * Roamola core schema — translated from ROAMOLA-BUILD.md §4, in corrected
 * table-creation order.
 *
 * FIX vs. the source doc: §4.1's `property.operator_id` forward-references
 * `account(id)`, and §4.2's `account.org_id` forward-references
 * `organisation(id)` — but both `account` and `organisation` are defined
 * *after* the tables that reference them. Postgres will not create a table
 * with a FK to a table that doesn't exist yet, so the real dependency order
 * is:
 *
 *   source -> place -> place_name -> organisation -> account
 *          -> property -> experience -> route -> rule -> signal
 *          -> page -> entity_claim
 *
 * (`event` is intentionally NOT here — BUILD.md §4.2 puts it in ClickHouse,
 * not Postgres; see packages/analytics.)
 *
 * Three rules from BUILD.md §0 that this file exists to enforce:
 *   1. Pages are rows, not files.
 *   2. Every published fact traces to a source_id.
 *   3. Signals are append-only (see the trigger in migrations, not here —
 *      Drizzle's schema builder can't express a trigger; it's raw SQL in
 *      the first migration).
 */

import {
  bigint,
  bigserial,
  boolean,
  customType,
  index,
  integer,
  interval,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// PostGIS geography columns. Drizzle has no native geography type, so these
// are thin customType wrappers -- see BUILD.md §1, "geography is first-class".
// ---------------------------------------------------------------------------
function geography(subtype: "Point" | "MultiPolygon") {
  return customType<{ data: string }>({
    dataType() {
      return `geography(${subtype}, 4326)`;
    },
  });
}
const geoPoint = geography("Point");
const geoMultiPolygon = geography("MultiPolygon");

// ---------------------------------------------------------------------------
// 1. source — the provenance register. Every fact points here. (§4.1)
// ---------------------------------------------------------------------------
export const source = pgTable("source", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  url: text("url").notNull(),
  licence: text("licence").notNull(),
  licenceUrl: text("licence_url"),
  commercialUse: boolean("commercial_use").notNull(),
  redistributable: boolean("redistributable").notNull().default(false),
  attributionText: text("attribution_text"),
  refreshInterval: interval("refresh_interval").notNull(),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastFailureAt: timestamp("last_failure_at", { withTimezone: true }),
  schemaVersion: text("schema_version"),
  active: boolean("active").notNull().default(true),
});

// ---------------------------------------------------------------------------
// 2. place — hierarchical, self-referencing. (§4.1)
// ---------------------------------------------------------------------------
export const place = pgTable(
  "place",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    parentId: bigint("parent_id", { mode: "bigint" }),
    type: text("type").notNull(), // country|region|county|city|district
    slug: text("slug").notNull(),
    canonicalName: text("canonical_name").notNull(),
    countryCode: text("country_code").notNull(), // CHAR(2) at the DB level via migration
    timezone: text("timezone").notNull(),
    population: bigint("population", { mode: "number" }),
    centroid: geoPoint("centroid").notNull(),
    boundary: geoMultiPolygon("boundary"),
    sourceId: integer("source_id").notNull().references(() => source.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    parentSlugUnique: uniqueIndex("place_parent_slug_unique").on(t.parentId, t.slug),
    centroidIdx: index("place_centroid_idx").using("gist", t.centroid),
    parentIdx: index("place_parent_idx").on(t.parentId),
    typeCountryIdx: index("place_type_country_idx").on(t.type, t.countryCode),
  }),
);

// ---------------------------------------------------------------------------
// 3. place_name — multilingual/alternate names, kept out of `place` to
//    avoid churn on the hot table. (§4.1)
// ---------------------------------------------------------------------------
export const placeName = pgTable(
  "place_name",
  {
    placeId: bigint("place_id", { mode: "bigint" })
      .notNull()
      .references(() => place.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(), // CHAR(2)
    name: text("name").notNull(),
    isPrimary: boolean("is_primary").notNull().default(false),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.placeId, t.lang, t.name] }),
  }),
);

// ---------------------------------------------------------------------------
// 4. organisation — moved ahead of `account` (fix; see file header). (§4.2)
// ---------------------------------------------------------------------------
export const organisation = pgTable("organisation", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  name: text("name").notNull(),
  plan: text("plan").notNull().default("free"),
  stripeCustomerId: text("stripe_customer_id").unique(),
  seats: integer("seats").notNull().default(1),
  verifiedDomain: text("verified_domain"),
});

// ---------------------------------------------------------------------------
// 5. account — moved ahead of `property`/`rule` which reference it. (§4.2)
// ---------------------------------------------------------------------------
export const account = pgTable("account", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  externalId: text("external_id").notNull().unique(), // auth provider id
  orgId: bigint("org_id", { mode: "bigint" }).references(() => organisation.id),
  email: text("email").notNull(),
  role: text("role").notNull().default("traveller"), // traveller|operator|investor|staff
  entitlements: text("entitlements").array().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// 6. property — any accommodation unit. (§4.1)
// ---------------------------------------------------------------------------
export const property = pgTable(
  "property",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    placeId: bigint("place_id", { mode: "bigint" }).notNull().references(() => place.id),
    category: text("category").notNull(), // hotel|hostel|resort|holiday_let|campsite
    name: text("name").notNull(),
    capacity: integer("capacity"),
    attributes: jsonb("attributes").notNull().default({}),
    location: geoPoint("location"),
    operatorId: bigint("operator_id", { mode: "bigint" }).references(() => account.id),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
    externalIds: jsonb("external_ids").notNull().default({}), // {"partner_slug": "their-id"}
    sourceId: integer("source_id").notNull().references(() => source.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    placeCategoryIdx: index("property_place_idx").on(t.placeId, t.category),
    externalIdsIdx: index("property_external_ids_idx").using("gin", t.externalIds),
  }),
);

// ---------------------------------------------------------------------------
// 7. experience — tours, activities, attractions. (§4.1)
// ---------------------------------------------------------------------------
export const experience = pgTable("experience", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  placeId: bigint("place_id", { mode: "bigint" }).notNull().references(() => place.id),
  theme: text("theme").notNull(), // controlled vocabulary -- packages/core/vocab.ts
  name: text("name").notNull(),
  durationMin: integer("duration_min"),
  seasonality: jsonb("seasonality"), // {"months":[4,5,6,7,8,9]}
  priceBand: text("price_band"), // free|low|mid|high
  accessibility: jsonb("accessibility").notNull().default({}),
  sourceId: integer("source_id").notNull().references(() => source.id),
});

// ---------------------------------------------------------------------------
// 8. route — origin/destination pairs. (§4.1)
// ---------------------------------------------------------------------------
export const route = pgTable(
  "route",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    originPlaceId: bigint("origin_place_id", { mode: "bigint" }).notNull().references(() => place.id),
    destinationPlaceId: bigint("destination_place_id", { mode: "bigint" }).notNull().references(() => place.id),
    mode: text("mode").notNull(), // air|rail|road|ferry
    durationMin: integer("duration_min"),
    frequencyWeekly: integer("frequency_weekly"),
    operators: text("operators").array(),
    seasonal: boolean("seasonal").notNull().default(false),
    sourceId: integer("source_id").notNull().references(() => source.id),
  },
  (t) => ({
    odModeUnique: uniqueIndex("route_od_mode_unique").on(t.originPlaceId, t.destinationPlaceId, t.mode),
  }),
);

// ---------------------------------------------------------------------------
// 9. rule — regulations. Highest trust value, highest harm risk if wrong.
//    100% human review per BUILD.md §7.4/§7.1. (§4.1)
// ---------------------------------------------------------------------------
export const rule = pgTable(
  "rule",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    subjectPlaceId: bigint("subject_place_id", { mode: "bigint" }).notNull().references(() => place.id),
    counterpartPlaceId: bigint("counterpart_place_id", { mode: "bigint" }).references(() => place.id), // null = place-only rule
    topic: text("topic").notNull(), // visa|licensing|tax|restriction|health
    requirement: jsonb("requirement").notNull(),
    summary: text("summary").notNull(),
    sourceUrl: text("source_url").notNull(), // must be a primary/official source
    sourceId: integer("source_id").notNull().references(() => source.id),
    effectiveFrom: timestamp("effective_from", { mode: "date" }),
    verifiedAt: timestamp("verified_at", { withTimezone: true }).notNull(),
    verifiedBy: bigint("verified_by", { mode: "bigint" }).references(() => account.id), // a human. always.
  },
  (t) => ({
    subjectCounterpartTopicUnique: uniqueIndex("rule_subject_counterpart_topic_unique").on(
      t.subjectPlaceId,
      t.counterpartPlaceId,
      t.topic,
    ),
  }),
);

// ---------------------------------------------------------------------------
// 10. signal — APPEND ONLY. No UPDATE, no DELETE (enforced by a DB trigger
//     added in the first migration, not expressible here). (§4.1, §0 rule 3)
// ---------------------------------------------------------------------------
export const signal = pgTable(
  "signal",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    entityType: text("entity_type").notNull(), // place|property|experience|route
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    metric: text("metric").notNull(), // adr|occupancy|sea_temp_c|seats|search_index
    value: numeric("value").notNull(),
    unit: text("unit").notNull(),
    observedAt: timestamp("observed_at", { withTimezone: true }).notNull(),
    sourceId: integer("source_id").notNull().references(() => source.id),
    confidence: numeric("confidence", { precision: 3, scale: 2 }).notNull().default("1.00"),
  },
  (t) => ({
    lookupIdx: index("signal_lookup_idx").on(t.entityType, t.entityId, t.metric, t.observedAt.desc()),
  }),
);

// ---------------------------------------------------------------------------
// 11. page — pages are rows, not files. (§4.2, §0 rule 1)
// ---------------------------------------------------------------------------
export const pageStatus = pgEnum("page_status", ["draft", "review", "published", "noindexed", "removed"]);

export const page = pgTable(
  "page",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    template: text("template").notNull(),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    variant: jsonb("variant").notNull().default({}), // e.g. {"month":"june"}
    url: text("url").notNull().unique(),
    status: pageStatus("status").notNull().default("draft"),
    completenessScore: numeric("completeness_score", { precision: 4, scale: 3 }).notNull(),
    similarityScore: numeric("similarity_score", { precision: 4, scale: 3 }),
    content: jsonb("content"), // rendered blocks, not HTML
    generationMeta: jsonb("generation_meta"), // {model, promptHash, generatedAt}
    publishedAt: timestamp("published_at", { withTimezone: true }),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    removedReason: text("removed_reason"),
  },
  (t) => ({
    templateEntityVariantUnique: uniqueIndex("page_template_entity_variant_unique").on(
      t.template,
      t.entityType,
      t.entityId,
      t.variant,
    ),
    statusTemplateIdx: index("page_status_template_idx").on(t.status, t.template),
  }),
);

// ---------------------------------------------------------------------------
// 12. entity_claim — an operator claiming/verifying a property. (§4.2)
// ---------------------------------------------------------------------------
export const entityClaim = pgTable(
  "entity_claim",
  {
    id: bigserial("id", { mode: "bigint" }).primaryKey(),
    accountId: bigint("account_id", { mode: "bigint" }).notNull().references(() => account.id),
    entityType: text("entity_type").notNull(),
    entityId: bigint("entity_id", { mode: "bigint" }).notNull(),
    method: text("method").notNull(), // domain|document|phone
    status: text("status").notNull().default("pending"),
    verifiedAt: timestamp("verified_at", { withTimezone: true }),
  },
  (t) => ({
    entityAccountUnique: uniqueIndex("entity_claim_entity_account_unique").on(
      t.entityType,
      t.entityId,
      t.accountId,
    ),
  }),
);


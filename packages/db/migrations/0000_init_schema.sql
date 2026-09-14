-- PostGIS must exist before any `geography(...)` column below can be created.
-- Not expressible in schema.ts (Drizzle has no notion of extensions) --
-- BUILD.md §1: "geography is first-class, not an afterthought."
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TYPE "public"."page_status" AS ENUM('draft', 'review', 'published', 'noindexed', 'removed');--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "account" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"external_id" text NOT NULL,
	"org_id" bigint,
	"email" text NOT NULL,
	"role" text DEFAULT 'traveller' NOT NULL,
	"entitlements" text[] DEFAULT '{}' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "account_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "entity_claim" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"account_id" bigint NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"method" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"verified_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "experience" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"place_id" bigint NOT NULL,
	"theme" text NOT NULL,
	"name" text NOT NULL,
	"duration_min" integer,
	"seasonality" jsonb,
	"price_band" text,
	"accessibility" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "organisation" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"stripe_customer_id" text,
	"seats" integer DEFAULT 1 NOT NULL,
	"verified_domain" text,
	CONSTRAINT "organisation_stripe_customer_id_unique" UNIQUE("stripe_customer_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "page" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"template" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"variant" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"url" text NOT NULL,
	"status" "page_status" DEFAULT 'draft' NOT NULL,
	"completeness_score" numeric(4, 3) NOT NULL,
	"similarity_score" numeric(4, 3),
	"content" jsonb,
	"generation_meta" jsonb,
	"published_at" timestamp with time zone,
	"last_verified_at" timestamp with time zone,
	"removed_reason" text,
	CONSTRAINT "page_url_unique" UNIQUE("url")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"parent_id" bigint,
	"type" text NOT NULL,
	"slug" text NOT NULL,
	"canonical_name" text NOT NULL,
	"country_code" text NOT NULL,
	"timezone" text NOT NULL,
	"population" bigint,
	"centroid" "geography(Point, 4326)" NOT NULL,
	"boundary" "geography(MultiPolygon, 4326)",
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "place_name" (
	"place_id" bigint NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	CONSTRAINT "place_name_place_id_lang_name_pk" PRIMARY KEY("place_id","lang","name")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "property" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"place_id" bigint NOT NULL,
	"category" text NOT NULL,
	"name" text NOT NULL,
	"capacity" integer,
	"attributes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"location" "geography(Point, 4326)",
	"operator_id" bigint,
	"verified_at" timestamp with time zone,
	"external_ids" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_id" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "route" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"origin_place_id" bigint NOT NULL,
	"destination_place_id" bigint NOT NULL,
	"mode" text NOT NULL,
	"duration_min" integer,
	"frequency_weekly" integer,
	"operators" text[],
	"seasonal" boolean DEFAULT false NOT NULL,
	"source_id" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rule" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"subject_place_id" bigint NOT NULL,
	"counterpart_place_id" bigint,
	"topic" text NOT NULL,
	"requirement" jsonb NOT NULL,
	"summary" text NOT NULL,
	"source_url" text NOT NULL,
	"source_id" integer NOT NULL,
	"effective_from" timestamp,
	"verified_at" timestamp with time zone NOT NULL,
	"verified_by" bigint
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "signal" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" bigint NOT NULL,
	"metric" text NOT NULL,
	"value" numeric NOT NULL,
	"unit" text NOT NULL,
	"observed_at" timestamp with time zone NOT NULL,
	"source_id" integer NOT NULL,
	"confidence" numeric(3, 2) DEFAULT '1.00' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "source" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"licence" text NOT NULL,
	"licence_url" text,
	"commercial_use" boolean NOT NULL,
	"redistributable" boolean DEFAULT false NOT NULL,
	"attribution_text" text,
	"refresh_interval" interval NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_failure_at" timestamp with time zone,
	"schema_version" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "source_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "account" ADD CONSTRAINT "account_org_id_organisation_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organisation"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "entity_claim" ADD CONSTRAINT "entity_claim_account_id_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experience" ADD CONSTRAINT "experience_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "experience" ADD CONSTRAINT "experience_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place" ADD CONSTRAINT "place_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "place_name" ADD CONSTRAINT "place_name_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property" ADD CONSTRAINT "property_place_id_place_id_fk" FOREIGN KEY ("place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property" ADD CONSTRAINT "property_operator_id_account_id_fk" FOREIGN KEY ("operator_id") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "property" ADD CONSTRAINT "property_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "route" ADD CONSTRAINT "route_origin_place_id_place_id_fk" FOREIGN KEY ("origin_place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "route" ADD CONSTRAINT "route_destination_place_id_place_id_fk" FOREIGN KEY ("destination_place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "route" ADD CONSTRAINT "route_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule" ADD CONSTRAINT "rule_subject_place_id_place_id_fk" FOREIGN KEY ("subject_place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule" ADD CONSTRAINT "rule_counterpart_place_id_place_id_fk" FOREIGN KEY ("counterpart_place_id") REFERENCES "public"."place"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule" ADD CONSTRAINT "rule_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "rule" ADD CONSTRAINT "rule_verified_by_account_id_fk" FOREIGN KEY ("verified_by") REFERENCES "public"."account"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "signal" ADD CONSTRAINT "signal_source_id_source_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."source"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "entity_claim_entity_account_unique" ON "entity_claim" USING btree ("entity_type","entity_id","account_id");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "page_template_entity_variant_unique" ON "page" USING btree ("template","entity_type","entity_id","variant");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "page_status_template_idx" ON "page" USING btree ("status","template");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "place_parent_slug_unique" ON "place" USING btree ("parent_id","slug");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_centroid_idx" ON "place" USING gist ("centroid");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_parent_idx" ON "place" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "place_type_country_idx" ON "place" USING btree ("type","country_code");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_place_idx" ON "property" USING btree ("place_id","category");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "property_external_ids_idx" ON "property" USING gin ("external_ids");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "route_od_mode_unique" ON "route" USING btree ("origin_place_id","destination_place_id","mode");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "rule_subject_counterpart_topic_unique" ON "rule" USING btree ("subject_place_id","counterpart_place_id","topic");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "signal_lookup_idx" ON "signal" USING btree ("entity_type","entity_id","metric","observed_at" DESC NULLS LAST);
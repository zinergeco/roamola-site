-- BUILD.md §0 rule 3 / §4.1: "signal is append-only." Drizzle's schema
-- builder can't express a trigger, so this is hand-written SQL layered on
-- top of the generated 0000 migration.

CREATE OR REPLACE FUNCTION signal_is_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'signal is append-only: % attempted on signal.id=%', TG_OP, OLD.id;
END; $$ LANGUAGE plpgsql;
--> statement-breakpoint

CREATE TRIGGER signal_no_mutate
  BEFORE UPDATE OR DELETE ON signal
  FOR EACH ROW EXECUTE FUNCTION signal_is_append_only();
--> statement-breakpoint

-- CHAR(2) constraints Drizzle's `text()` can't express (BUILD.md §4.1).
ALTER TABLE place ALTER COLUMN country_code TYPE char(2);
--> statement-breakpoint
ALTER TABLE place_name ALTER COLUMN lang TYPE char(2);

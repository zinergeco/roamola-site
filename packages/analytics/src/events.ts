// BUILD.md §10, verbatim. "Start on day one, before there is traffic" --
// retrospective history cannot be created. This is why it's scaffolded in
// M1, before any page template exists to fire these.
import { z } from "zod";

export const EVENTS = {
  page_view: z.object({ template: z.string(), entityId: z.number() }),
  tool_started: z.object({ tool: z.string() }),
  tool_input: z.object({ tool: z.string(), field: z.string(), value: z.unknown() }),
  tool_completed: z.object({ tool: z.string(), durationMs: z.number() }),
  tool_abandoned: z.object({ tool: z.string(), atField: z.string() }),
  search_performed: z.object({ query: z.string(), results: z.number() }),
  search_no_result: z.object({ query: z.string() }), // template ideas live here
  affiliate_click: z.object({ partner: z.string(), vertical: z.string() }),
  trip_saved: z.object({ placeIds: z.array(z.number()) }),
  enquiry_sent: z.object({ entityType: z.string(), entityId: z.number() }),
  listing_claimed: z.object({ propertyId: z.number() }),
  upgrade_viewed: z.object({ tier: z.string(), trigger: z.string() }),
} as const;

export type EventName = keyof typeof EVENTS;

// ClickHouse `event` table shape -- BUILD.md §4.2. Lives in ClickHouse, not
// Postgres; packages/db/schema.ts deliberately has no `event` table.
export interface ClickHouseEvent {
  event_id: string;
  occurred_at: string; // DateTime64(3)
  session_id: string;
  account_id: number | null;
  type: EventName;
  entity_type: string | null;
  entity_id: number | null;
  template: string | null;
  payload: string; // JSON-encoded, validated against EVENTS[type] before write
  country: string;
  device: string;
}

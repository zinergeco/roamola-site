// ClickHouse HTTP-interface writer for the `event` table (BUILD.md §4.2,
// §10). No official driver is pulled in for one table and two operations --
// the HTTP interface (port 8123, not the 9000 native port) takes plain SQL
// over POST, which is all `ensureEventTable`/`writeEvent`/`readRecentEvents`
// need.
import { EVENTS, type EventName, type ClickHouseEvent } from "./events";

const EVENT_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS event (
  event_id     UUID,
  occurred_at  DateTime64(3),
  session_id   String,
  account_id   Nullable(UInt64),
  type         LowCardinality(String),
  entity_type  LowCardinality(String),
  entity_id    Nullable(UInt64),
  template     LowCardinality(String),
  payload      String,
  country      LowCardinality(String),
  device       LowCardinality(String)
) ENGINE = MergeTree()
PARTITION BY toYYYYMM(occurred_at)
ORDER BY (type, occurred_at, session_id)
`.trim();

function config() {
  const url = process.env.CLICKHOUSE_URL;
  if (!url) throw new Error("CLICKHOUSE_URL is not set -- see .env.example");
  return {
    url: url.replace(/\/$/, ""),
    user: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "",
    database: process.env.CLICKHOUSE_DATABASE ?? "default",
  };
}

async function exec(sql: string): Promise<Response> {
  const { url, user, password, database } = config();
  const qs = new URLSearchParams({ database });
  const res = await fetch(`${url}/?${qs.toString()}`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`,
      "Content-Type": "text/plain",
    },
    body: sql,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickHouse query failed (${res.status}): ${text.slice(0, 500)}`);
  }
  return res;
}

/** Idempotent. Safe to call on every container start (BUILD.md M1: "event
 *  capture live and writing to ClickHouse before any traffic"). */
export async function ensureEventTable(): Promise<void> {
  await exec(EVENT_TABLE_DDL);
}

export interface WriteEventInput {
  type: EventName;
  payload: unknown;
  sessionId: string;
  accountId?: number | null;
  entityType?: string | null;
  entityId?: number | null;
  template?: string | null;
  country?: string;
  device?: string;
}

function chDateTime(d: Date): string {
  // ClickHouse DateTime64(3) via JSONEachRow wants "YYYY-MM-DD HH:MM:SS.mmm",
  // not ISO 8601 -- no "T", no "Z".
  return d.toISOString().replace("T", " ").replace("Z", "");
}

/** Validates payload against EVENTS[type] before writing -- the contract is
 *  enforced here, not left to callers (BUILD.md §10). */
export async function writeEvent(input: WriteEventInput): Promise<ClickHouseEvent> {
  const schema = EVENTS[input.type];
  if (!schema) throw new Error(`Unknown event type: ${input.type}`);
  const parsed = schema.parse(input.payload);

  const row: ClickHouseEvent = {
    event_id: crypto.randomUUID(),
    occurred_at: chDateTime(new Date()),
    session_id: input.sessionId,
    account_id: input.accountId ?? null,
    type: input.type,
    entity_type: input.entityType ?? null,
    entity_id: input.entityId ?? null,
    template: input.template ?? null,
    payload: JSON.stringify(parsed),
    country: input.country ?? "unknown",
    device: input.device ?? "unknown",
  };

  await exec(`INSERT INTO event FORMAT JSONEachRow\n${JSON.stringify(row)}`);
  return row;
}

export async function readEventById(eventId: string): Promise<ClickHouseEvent | null> {
  const res = await exec(
    `SELECT event_id, occurred_at, session_id, account_id, type, entity_type, entity_id, template, payload, country, device ` +
      `FROM event WHERE event_id = '${eventId.replace(/'/g, "")}' FORMAT JSON`,
  );
  const body = (await res.json()) as { data: ClickHouseEvent[] };
  return body.data[0] ?? null;
}

export async function readRecentEvents(limit = 10): Promise<ClickHouseEvent[]> {
  const safeLimit = Math.max(1, Math.min(100, Math.floor(limit)));
  const res = await exec(
    `SELECT event_id, occurred_at, session_id, account_id, type, entity_type, entity_id, template, payload, country, device ` +
      `FROM event ORDER BY occurred_at DESC LIMIT ${safeLimit} FORMAT JSON`,
  );
  const body = (await res.json()) as { data: ClickHouseEvent[] };
  return body.data;
}

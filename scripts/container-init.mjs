#!/usr/bin/env node
// Runs once per container start, before `next start` (see the Dockerfile
// CMD). Both steps are idempotent -- safe on every deploy and every
// restart, not just the first one:
//
//   1. Apply any pending Postgres migrations (drizzle-kit migrate).
//   2. Ensure the ClickHouse `event` table exists (BUILD.md M1: "event
//      capture live and writing to ClickHouse before any traffic").
//
// Plain Node, not TypeScript: this is a one-shot startup script, not part
// of the Next.js bundle, so pulling in a TS loader just for it isn't worth
// it. The ClickHouse DDL below is duplicated from the canonical definition
// in packages/analytics/src/clickhouse.ts -- keep the two in sync if the
// `event` table shape ever changes.
import { execSync } from "node:child_process";

console.log("[container-init] applying Postgres migrations...");
execSync("pnpm --filter @roamola/db run migrate", { stdio: "inherit" });
console.log("[container-init] migrations applied.");

const CLICKHOUSE_URL = process.env.CLICKHOUSE_URL;
if (!CLICKHOUSE_URL) {
  console.log("[container-init] CLICKHOUSE_URL not set -- skipping event table init.");
} else {
  console.log("[container-init] ensuring ClickHouse `event` table exists...");

  const user = process.env.CLICKHOUSE_USER ?? "default";
  const password = process.env.CLICKHOUSE_PASSWORD ?? "";
  const database = process.env.CLICKHOUSE_DATABASE ?? "default";

  const ddl = `
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

  const auth = Buffer.from(`${user}:${password}`).toString("base64");
  const res = await fetch(`${CLICKHOUSE_URL.replace(/\/$/, "")}/?database=${encodeURIComponent(database)}`, {
    method: "POST",
    headers: { Authorization: `Basic ${auth}`, "Content-Type": "text/plain" },
    body: ddl,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`ClickHouse event-table init failed (${res.status}): ${text.slice(0, 500)}`);
  }
  console.log("[container-init] ClickHouse `event` table ready.");
}

console.log("[container-init] done.");

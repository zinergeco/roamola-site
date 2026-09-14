import { sql } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db, page, place, signal, source } from "@roamola/db";
import { readRecentEvents } from "@roamola/analytics";

// Touches live Postgres/ClickHouse on every load -- never prerender this at
// build time (no DB is reachable from the build stage; see Dockerfile).
export const dynamic = "force-dynamic";

async function count(table: PgTable): Promise<number> {
  const rows = await db.select({ n: sql<number>`count(*)`.mapWith(Number) }).from(table as any);
  return rows[0]?.n ?? 0;
}

async function safe<T>(fn: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false; error: string }> {
  try {
    return { ok: true, value: await fn() };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export default async function AdminOverviewPage() {
  const [sources, places, signals, pages, recentEvents] = await Promise.all([
    safe(() => count(source)),
    safe(() => count(place)),
    safe(() => count(signal)),
    safe(() => count(page)),
    safe(() => readRecentEvents(5)),
  ]);

  const stats: { label: string; result: Awaited<ReturnType<typeof safe<number>>> }[] = [
    { label: "source rows", result: sources },
    { label: "place rows", result: places },
    { label: "signal rows (append-only)", result: signals },
    { label: "page rows", result: pages },
  ];

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <p className="font-disp" style={{ fontSize: ".72rem", color: "var(--brass)", letterSpacing: ".05em", margin: "0 0 .6rem", textTransform: "uppercase" }}>
        Admin
      </p>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: "0 0 .8rem" }}>Overview</h1>
      <p style={{ color: "var(--mist)", maxWidth: 660, marginBottom: "2rem" }}>
        Live counts from the production Postgres and ClickHouse instances provisioned
        for this app — not mock numbers. Zero across the board is expected until real
        data is ingested (M2) or the system check has been run at least once.
      </p>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 1rem" }}>Postgres</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: ".8rem" }}>
          {stats.map((s) => (
            <div
              key={s.label}
              style={{ border: "1px solid var(--line-bright)", borderRadius: 10, background: "var(--panel)", padding: "1rem 1.2rem" }}
            >
              <div className="font-disp" style={{ fontSize: "1.6rem", fontWeight: 700, color: s.result.ok ? "var(--paper)" : "var(--coral)" }}>
                {s.result.ok ? s.result.value : "—"}
              </div>
              <div style={{ fontSize: ".78rem", color: "var(--mist)", marginTop: ".2rem" }}>{s.label}</div>
              {!s.result.ok && (
                <div className="mono" style={{ fontSize: ".7rem", color: "var(--coral)", marginTop: ".4rem" }}>
                  {s.result.error}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.05rem", margin: "0 0 1rem" }}>ClickHouse — recent events</h2>
        {!recentEvents.ok && (
          <div style={{ border: "1px solid var(--coral)", borderRadius: 10, background: "var(--panel)", padding: "1rem 1.2rem" }}>
            <p className="mono" style={{ color: "var(--coral)", fontSize: ".82rem", margin: 0 }}>{recentEvents.error}</p>
          </div>
        )}
        {recentEvents.ok && recentEvents.value.length === 0 && (
          <p style={{ color: "var(--mist-dim)", fontSize: ".85rem" }}>
            No events yet — visit the dashboard (fires a page_view) or run the system check.
          </p>
        )}
        {recentEvents.ok && recentEvents.value.length > 0 && (
          <div style={{ border: "1px solid var(--line-bright)", borderRadius: 10, background: "var(--panel)", overflow: "hidden" }}>
            {recentEvents.value.map((e, i) => (
              <div
                key={e.event_id}
                style={{
                  padding: ".7rem 1.1rem",
                  borderTop: i === 0 ? "none" : "1px solid var(--line)",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: "1rem",
                  fontSize: ".8rem",
                }}
              >
                <span className="font-disp" style={{ color: "var(--brass-bright)", fontWeight: 700 }}>{e.type}</span>
                <span className="mono" style={{ color: "var(--mist)" }}>{e.occurred_at}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}

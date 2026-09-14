"use client";

import { useState, useTransition } from "react";
import { applyKillSwitch, createFixturePage, listPages, type PageRow } from "./actions";

const statusColor: Record<string, string> = {
  draft: "var(--mist-dim)",
  review: "var(--brass)",
  published: "var(--good)",
  noindexed: "var(--brass-bright)",
  removed: "var(--coral)",
};

export default function KillSwitchClient({ initialPages }: { initialPages: PageRow[] }) {
  const [pages, setPages] = useState(initialPages);
  const [log, setLog] = useState<string[]>([]);
  const [pending, startTransition] = useTransition();

  function refresh() {
    startTransition(async () => setPages(await listPages()));
  }

  function handleCreateFixture() {
    startTransition(async () => {
      const res = await createFixturePage();
      setLog((l) => [res.detail, ...l]);
      if (res.ok) setPages(await listPages());
    });
  }

  function handleKill(pageId: string, action: "noindex" | "remove") {
    const reason = window.prompt(
      `Reason for marking page ${pageId} as ${action === "noindex" ? "noindexed" : "removed"}?`,
      "manual test via admin kill switch",
    );
    if (reason === null) return; // cancelled
    startTransition(async () => {
      const res = await applyKillSwitch(pageId, action, reason);
      setLog((l) => [res.detail, ...l]);
      if (res.ok) setPages(await listPages());
    });
  }

  return (
    <div>
      <div style={{ display: "flex", gap: ".7rem", marginBottom: "1.5rem" }}>
        <button
          onClick={handleCreateFixture}
          disabled={pending}
          className="font-disp"
          style={{
            background: "var(--panel)",
            color: "var(--paper)",
            border: "1px solid var(--line-bright)",
            borderRadius: 8,
            padding: ".6rem 1.1rem",
            fontWeight: 600,
            fontSize: ".8rem",
            cursor: pending ? "default" : "pointer",
          }}
        >
          + Create fixture page
        </button>
        <button
          onClick={refresh}
          disabled={pending}
          className="font-disp"
          style={{
            background: "transparent",
            color: "var(--mist)",
            border: "1px solid var(--line-bright)",
            borderRadius: 8,
            padding: ".6rem 1.1rem",
            fontWeight: 600,
            fontSize: ".8rem",
            cursor: pending ? "default" : "pointer",
          }}
        >
          Refresh
        </button>
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: ".6rem", marginBottom: "2rem" }}>
        {pages.length === 0 && (
          <p style={{ color: "var(--mist-dim)", fontSize: ".85rem" }}>No page rows yet.</p>
        )}
        {pages.map((p) => (
          <div
            key={p.id}
            style={{
              border: "1px solid var(--line-bright)",
              borderRadius: 10,
              background: "var(--panel)",
              padding: ".9rem 1.1rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "1rem",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: ".5rem", marginBottom: ".25rem" }}>
                <span className="mono" style={{ fontSize: ".78rem", color: "var(--mist)" }}>
                  #{p.id}
                </span>
                <span style={{ fontWeight: 600 }}>{p.url}</span>
              </div>
              <span
                className="font-disp"
                style={{
                  fontSize: ".66rem",
                  fontWeight: 700,
                  padding: ".18rem .55rem",
                  borderRadius: 100,
                  color: "var(--void)",
                  background: statusColor[p.status] ?? "var(--mist-dim)",
                }}
              >
                {p.status}
              </span>
              {p.removedReason && (
                <span style={{ marginLeft: ".6rem", fontSize: ".78rem", color: "var(--mist-dim)" }}>
                  {p.removedReason}
                </span>
              )}
            </div>
            <div style={{ display: "flex", gap: ".5rem" }}>
              <button
                onClick={() => handleKill(p.id, "noindex")}
                disabled={pending || p.status === "noindexed" || p.status === "removed"}
                className="font-disp"
                style={{
                  background: "transparent",
                  color: "var(--brass-bright)",
                  border: "1px solid var(--brass)",
                  borderRadius: 8,
                  padding: ".4rem .8rem",
                  fontSize: ".75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: p.status === "noindexed" || p.status === "removed" ? 0.4 : 1,
                }}
              >
                Noindex
              </button>
              <button
                onClick={() => handleKill(p.id, "remove")}
                disabled={pending || p.status === "removed"}
                className="font-disp"
                style={{
                  background: "transparent",
                  color: "var(--coral)",
                  border: "1px solid var(--coral)",
                  borderRadius: 8,
                  padding: ".4rem .8rem",
                  fontSize: ".75rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: p.status === "removed" ? 0.4 : 1,
                }}
              >
                Kill (remove)
              </button>
            </div>
          </div>
        ))}
      </div>

      {log.length > 0 && (
        <div>
          <h2 style={{ fontSize: "1rem", margin: "0 0 .7rem" }}>Log</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: ".4rem" }}>
            {log.map((l, i) => (
              <p key={i} className="mono" style={{ fontSize: ".78rem", color: "var(--mist)", margin: 0 }}>
                {l}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

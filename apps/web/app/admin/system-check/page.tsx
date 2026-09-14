"use client";

import { useState, useTransition } from "react";
import { runSystemCheck, type SystemCheckResult } from "./actions";

export default function SystemCheckPage() {
  const [result, setResult] = useState<SystemCheckResult | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <p className="font-disp" style={{ fontSize: ".72rem", color: "var(--brass)", letterSpacing: ".05em", margin: "0 0 .6rem", textTransform: "uppercase" }}>
        Admin &middot; M1 acceptance test
      </p>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: "0 0 .8rem" }}>System check</h1>
      <p style={{ color: "var(--mist)", maxWidth: 620, marginBottom: "1.6rem" }}>
        BUILD.md §15 defines M1 as done when: &ldquo;you can insert a place, attach a
        signal, fail to update that signal, and see an event in ClickHouse.&rdquo; This
        button runs exactly that, live, against production Postgres and ClickHouse.
      </p>

      <button
        onClick={() => startTransition(async () => setResult(await runSystemCheck()))}
        disabled={pending}
        className="font-disp"
        style={{
          background: "var(--brass)",
          color: "var(--void)",
          border: "none",
          borderRadius: 8,
          padding: ".7rem 1.4rem",
          fontWeight: 700,
          fontSize: ".85rem",
          cursor: pending ? "default" : "pointer",
          opacity: pending ? 0.6 : 1,
        }}
      >
        {pending ? "Running…" : "Run verification"}
      </button>

      {result && (
        <div style={{ marginTop: "2rem" }}>
          <div
            style={{
              display: "inline-block",
              padding: ".3rem .8rem",
              borderRadius: 100,
              fontSize: ".78rem",
              fontWeight: 700,
              marginBottom: "1.2rem",
              color: result.allPassed ? "var(--void)" : "var(--paper)",
              background: result.allPassed ? "var(--good)" : "var(--coral)",
            }}
          >
            {result.allPassed ? "PASS — M1 done-when condition satisfied" : "FAIL — see steps below"}
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
            {result.steps.map((s, i) => (
              <div
                key={i}
                style={{
                  border: `1px solid ${s.ok ? "var(--line-bright)" : "var(--coral)"}`,
                  borderRadius: 10,
                  background: "var(--panel)",
                  padding: "1rem 1.2rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", marginBottom: ".4rem" }}>
                  <span style={{ fontWeight: 600 }}>
                    {s.ok ? "✓" : "✗"} {s.name}
                  </span>
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--mist-dim)", whiteSpace: "nowrap" }}>
                    {s.ms}ms
                  </span>
                </div>
                <p className="mono" style={{ color: "var(--mist)", fontSize: ".8rem", margin: 0, wordBreak: "break-word" }}>
                  {s.detail}
                </p>
              </div>
            ))}
          </div>

          <p style={{ color: "var(--mist-dim)", fontSize: ".78rem", marginTop: "1rem" }}>
            Ran at {new Date(result.ranAt).toLocaleString()}
          </p>
        </div>
      )}
    </main>
  );
}

import { listPages } from "./actions";
import KillSwitchClient from "./KillSwitchClient";

// Touches live Postgres on every load -- never prerender at build time.
export const dynamic = "force-dynamic";

export default async function KillSwitchPage() {
  const pages = await listPages();
  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <p className="font-disp" style={{ fontSize: ".72rem", color: "var(--brass)", letterSpacing: ".05em", margin: "0 0 .6rem", textTransform: "uppercase" }}>
        Admin
      </p>
      <h1 style={{ fontSize: "1.8rem", fontWeight: 700, margin: "0 0 .8rem" }}>Kill switch</h1>
      <p style={{ color: "var(--mist)", maxWidth: 660, marginBottom: "1.6rem" }}>
        BUILD.md §12: one admin action, one transaction, to pull a page down. No
        real pages are published yet (M3 builds the first template) — use
        &ldquo;Create fixture page&rdquo; below to get a real row to test against.
      </p>
      <KillSwitchClient initialPages={pages} />
    </main>
  );
}

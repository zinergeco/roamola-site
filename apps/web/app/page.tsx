type MilestoneStatus = "done" | "in-progress" | "not-started";

interface Milestone {
  id: string;
  weeks: string;
  title: string;
  status: MilestoneStatus;
  detail: string;
}

// Honest, hand-maintained build status -- BUILD.md §15 milestone list.
// Update this array as milestones actually move, not on a schedule.
const milestones: Milestone[] = [
  {
    id: "M1",
    weeks: "1–4",
    title: "Schema, event capture, admin shell, kill switch",
    status: "done",
    detail:
      "Postgres+PostGIS/Redis/ClickHouse provisioned in Coolify, schema migrated, append-only trigger enforced. Admin shell live at /admin (system check + kill switch). Event capture writing to ClickHouse. See docs/DECISIONS.md #6.",
  },
  {
    id: "M2",
    weeks: "5–8",
    title: "Ingestion pipelines",
    status: "in-progress",
    detail:
      "ingest/validate are real and proven live in production: roamola-pipelines deployed on Coolify, scripts/m2_check.py run directly on that container against real production Postgres + MinIO -- all 4 checks pass (bucket ready, fresh ingest, replay-from-raw content-hash match, poisoned batch blocked). See docs/DECISIONS.md. Still no real connector: docs/SOURCES.md is empty until launch markets are chosen (business decision, not fabricated).",
  },
  {
    id: "M3",
    weeks: "9–12",
    title: "Template + generation system, destination pages live",
    status: "in-progress",
    detail:
      "The gate engine (data-sufficiency scoring, sibling-similarity check, prose-ratio check -- BUILD.md §7) is real, unit-tested, and proven against a synthetic fixture batch, same pattern as M2. No real pages exist: the Postgres-backed candidate query is real but unexercised, and the model call in the LLM service is still unimplemented on purpose (a provider/cost decision, not made yet). See docs/DECISIONS.md.",
  },
  {
    id: "M4",
    weeks: "13–18",
    title: "Real auth (Auth.js), accounts, entitlements enforced",
    status: "not-started",
    detail: "This app currently uses a single shared dev password, not real auth.",
  },
  {
    id: "M5",
    weeks: "19–26",
    title: "Tools, business portal",
    status: "not-started",
    detail: "",
  },
  {
    id: "M6",
    weeks: "27–38",
    title: "Insights, assets module (flagged), store",
    status: "not-started",
    detail: "",
  },
  {
    id: "M7",
    weeks: "39+",
    title: "Scale, monetisation maturity",
    status: "not-started",
    detail: "",
  },
];

const decisionsConfirmed = [
  "Hosting: self-host everything on Coolify (Postgres+PostGIS, Redis, ClickHouse, Typesense, Next.js) on the existing OVHcloud box.",
  "Repo: replace zinergeco/roamola-site's contents in place, not a new repo.",
  "Delivery: fine-grained GitHub PAT scoped to this repo — used, via the linked device's shell (this sandbox's own git access is repo-gated independent of any PAT; see docs/DECISIONS.md #2).",
];

const decisionsOpen = [
  "Auth provider defaulting to Auth.js (no external account) unless Clerk is preferred.",
];

const statusColor: Record<MilestoneStatus, string> = {
  done: "var(--good)",
  "in-progress": "var(--brass-bright)",
  "not-started": "var(--mist-dim)",
};

const statusLabel: Record<MilestoneStatus, string> = {
  done: "Done",
  "in-progress": "In progress",
  "not-started": "Not started",
};

function Badge({ status }: { status: MilestoneStatus }) {
  return (
    <span
      className="font-disp"
      style={{
        fontSize: ".66rem",
        fontWeight: 600,
        letterSpacing: ".03em",
        padding: ".22rem .6rem",
        borderRadius: 100,
        display: "inline-block",
        color: status === "not-started" ? "var(--mist)" : "var(--void)",
        background: status === "not-started" ? "transparent" : statusColor[status],
        border: status === "not-started" ? "1px solid var(--line-bright)" : "none",
        whiteSpace: "nowrap",
      }}
    >
      {statusLabel[status]}
    </span>
  );
}

export default function HomePage() {
  return (
    <main style={{ maxWidth: 880, margin: "0 auto", padding: "3rem 1.5rem 5rem" }}>
      <header style={{ marginBottom: "2.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "1rem" }}>
          <p
            className="font-disp"
            style={{
              fontSize: ".72rem",
              color: "var(--brass)",
              letterSpacing: ".05em",
              margin: "0 0 .6rem",
              textTransform: "uppercase",
            }}
          >
            Build status — not public
          </p>
          <a
            href="/admin"
            className="font-disp"
            style={{ fontSize: ".78rem", color: "var(--mist)", textDecoration: "none", fontWeight: 600 }}
          >
            Admin →
          </a>
        </div>
        <h1 style={{ fontSize: "clamp(1.8rem,4vw,2.4rem)", fontWeight: 700, margin: "0 0 .8rem" }}>
          roamola<span style={{ color: "var(--brass-bright)" }}>.</span>
        </h1>
        <p style={{ color: "var(--mist)", maxWidth: 620 }}>
          This is the real, current state of the build — not a mockup. Everything
          here is gated behind the dev password and stays off `main` until it
          actually works, per the sequencing plan in{" "}
          <code>docs/DECISIONS.md</code>.
        </p>
      </header>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 1rem" }}>Milestones (BUILD.md §15)</h2>
        <div style={{ display: "flex", flexDirection: "column", gap: ".7rem" }}>
          {milestones.map((m) => (
            <div
              key={m.id}
              style={{
                border: "1px solid var(--line-bright)",
                borderRadius: 10,
                background: "var(--panel)",
                padding: "1rem 1.2rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: "1rem",
                  flexWrap: "wrap",
                }}
              >
                <div style={{ display: "flex", alignItems: "baseline", gap: ".6rem" }}>
                  <span className="font-disp" style={{ fontWeight: 700, color: "var(--brass-bright)" }}>
                    {m.id}
                  </span>
                  <span style={{ fontWeight: 600 }}>{m.title}</span>
                  <span className="mono" style={{ fontSize: ".75rem", color: "var(--mist-dim)" }}>
                    wk {m.weeks}
                  </span>
                </div>
                <Badge status={m.status} />
              </div>
              {m.detail && (
                <p style={{ color: "var(--mist)", fontSize: ".85rem", margin: ".55rem 0 0" }}>
                  {m.detail}
                </p>
              )}
            </div>
          ))}
        </div>
      </section>

      <section style={{ marginBottom: "2.5rem" }}>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 1rem" }}>Decisions</h2>
        <div
          style={{
            border: "1px solid var(--line-bright)",
            borderRadius: 10,
            background: "var(--panel)",
            padding: "1.2rem",
          }}
        >
          <h4
            className="font-disp"
            style={{ fontSize: ".8rem", color: "var(--good)", margin: "0 0 .6rem" }}
          >
            Confirmed
          </h4>
          <ul style={{ margin: "0 0 1.2rem", paddingLeft: "1.1rem", color: "var(--mist)", fontSize: ".88rem" }}>
            {decisionsConfirmed.map((d, i) => (
              <li key={i} style={{ marginBottom: ".4rem" }}>
                {d}
              </li>
            ))}
          </ul>
          <h4
            className="font-disp"
            style={{ fontSize: ".8rem", color: "var(--brass-bright)", margin: "0 0 .6rem" }}
          >
            Still open
          </h4>
          <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--mist)", fontSize: ".88rem" }}>
            {decisionsOpen.map((d, i) => (
              <li key={i}>{d}</li>
            ))}
          </ul>
        </div>
      </section>

      <section>
        <h2 style={{ fontSize: "1.1rem", margin: "0 0 1rem" }}>Next up</h2>
        <ol style={{ color: "var(--mist)", fontSize: ".9rem", paddingLeft: "1.2rem" }}>
          <li style={{ marginBottom: ".4rem" }}>
            Choose 3–4 launch markets and populate <code>docs/SOURCES.md</code> —
            business decision, not something to fabricate. Both M2&apos;s pipeline
            and M3&apos;s gate engine are built, tested, and waiting on this.
          </li>
          <li style={{ marginBottom: ".4rem" }}>Build the first real connector against a vetted, licensed source once markets are chosen.</li>
          <li style={{ marginBottom: ".4rem" }}>Wire up a real model provider for the LLM service (a deliberate cost/infra decision) once there&apos;s real data to generate from.</li>
          <li>200-page pilot, 100% reviewed, per M3&apos;s BUILD.md §15 done-when.</li>
        </ol>
      </section>
    </main>
  );
}

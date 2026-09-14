import Link from "next/link";

export const metadata = {
  title: "Roamola — admin",
  robots: { index: false, follow: false },
};

const links = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/system-check", label: "System check" },
  { href: "/admin/kill-switch", label: "Kill switch" },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <nav
        style={{
          borderBottom: "1px solid var(--line-bright)",
          background: "var(--hull)",
          padding: "0 1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "1.5rem",
          height: 52,
        }}
      >
        <Link href="/" className="font-disp" style={{ color: "var(--brass-bright)", fontWeight: 700, textDecoration: "none", fontSize: ".85rem" }}>
          roamola<span style={{ opacity: 0.6 }}>/admin</span>
        </Link>
        <div style={{ display: "flex", gap: "1.2rem" }}>
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className="font-disp"
              style={{ color: "var(--mist)", textDecoration: "none", fontSize: ".8rem", fontWeight: 600 }}
            >
              {l.label}
            </Link>
          ))}
        </div>
      </nav>
      {children}
    </div>
  );
}

import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, expectedCookieValue } from "../../../middleware";

/**
 * Verifies the submitted password against DEV_ACCESS_PASSWORD and, on a
 * match, sets the dev-gate cookie to a hash of it (never the raw value --
 * see middleware.ts for why). This is the temporary M1-M3 gate, not the
 * real auth system (that's M4, Auth.js, per docs/DECISIONS.md #4).
 */

// req.url in a Node-runtime route handler (unlike Edge middleware's
// req.nextUrl) does not reliably reflect the public host/proto behind
// Coolify's Traefik proxy -- in production this resolved to
// https://localhost:80 instead of https://roamola.com, breaking the
// post-login redirect. Build the base URL from the forwarded headers
// Traefik sets instead of trusting req.url.
function publicBaseUrl(req: NextRequest): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  return host ? `${proto}://${host}` : req.url;
}

export async function POST(req: NextRequest) {
  let password = "";
  let from = "/";

  const contentType = req.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    const body = await req.json().catch(() => ({}));
    password = typeof body.password === "string" ? body.password : "";
    from = typeof body.from === "string" ? body.from : "/";
  } else {
    const form = await req.formData();
    password = String(form.get("password") ?? "");
    from = String(form.get("from") ?? "/");
  }

  const configured = process.env.DEV_ACCESS_PASSWORD ?? "";
  const safeFrom = from.startsWith("/") && !from.startsWith("//") ? from : "/";
  const base = publicBaseUrl(req);

  if (!configured || password !== configured) {
    const url = new URL("/login", base);
    url.searchParams.set("from", safeFrom);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(safeFrom, base), { status: 303 });
  res.cookies.set(COOKIE_NAME, await expectedCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
  return res;
}

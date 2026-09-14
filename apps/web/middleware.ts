import { NextRequest, NextResponse } from "next/server";

/**
 * Temporary development gate -- NOT the real auth system.
 *
 * The real thing (BUILD.md §11: Auth.js, accounts, roles, entitlements) is
 * M4 work and needs the `account`/`organisation` tables live. Until then,
 * this is a single shared password in front of the whole site so nothing
 * half-built is publicly reachable or indexable while M1-M3 are in
 * progress -- Zinerge asked for exactly this ("develop all inside a
 * login protected page").
 */

export const COOKIE_NAME = "roamola_dev_access";

// The cookie never holds the raw password -- it holds a hash of it, derived
// with Web Crypto (available in both the Edge middleware runtime and the
// Node API route runtime) so the same function works in both places.
export async function expectedCookieValue(): Promise<string> {
  const password = process.env.DEV_ACCESS_PASSWORD ?? "";
  const bytes = new TextEncoder().encode(`roamola-dev-gate:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/api/login") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const cookie = req.cookies.get(COOKIE_NAME)?.value;
  if (cookie && process.env.DEV_ACCESS_PASSWORD && cookie === (await expectedCookieValue())) {
    return NextResponse.next();
  }

  const loginUrl = new URL("/login", req.url);
  loginUrl.searchParams.set("from", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

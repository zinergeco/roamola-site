import { NextRequest, NextResponse } from "next/server";
import { COOKIE_NAME, expectedCookieValue } from "../../../middleware";

/**
 * Verifies the submitted password against DEV_ACCESS_PASSWORD and, on a
 * match, sets the dev-gate cookie to a hash of it (never the raw value --
 * see middleware.ts for why). This is the temporary M1-M3 gate, not the
 * real auth system (that's M4, Auth.js, per docs/DECISIONS.md #4).
 */
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

  if (!configured || password !== configured) {
    const url = new URL("/login", req.url);
    url.searchParams.set("from", safeFrom);
    url.searchParams.set("error", "1");
    return NextResponse.redirect(url, { status: 303 });
  }

  const res = NextResponse.redirect(new URL(safeFrom, req.url), { status: 303 });
  res.cookies.set(COOKIE_NAME, await expectedCookieValue(), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 14, // 14 days
  });
  return res;
}

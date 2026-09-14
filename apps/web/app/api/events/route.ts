import { NextRequest, NextResponse } from "next/server";
import { writeEvent, type EventName } from "@roamola/analytics";

/**
 * Analytics ingest (BUILD.md §5, §10). "Start on day one, before there is
 * traffic" -- this exists so the M1 'done when' test (an event lands in
 * ClickHouse) is a real code path, not a one-off script, and so the
 * dashboard's own page views are the first real signal in the system.
 *
 * Consent (BUILD.md §10): this endpoint carries product-analytics events
 * only, under legitimate interest, no cross-site identifiers -- no
 * advertising/marketing event types are defined in packages/analytics yet,
 * and none should be added to this same path when they are.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  if (!body || typeof body.type !== "string") {
    return NextResponse.json({ ok: false, error: "Missing event `type`" }, { status: 400 });
  }

  const sessionId =
    req.cookies.get("roamola_session")?.value ?? crypto.randomUUID(); // no account system yet (M4) -- anonymous session id only

  try {
    const event = await writeEvent({
      type: body.type as EventName,
      payload: body.payload ?? {},
      sessionId,
      entityType: body.entityType ?? null,
      entityId: typeof body.entityId === "number" ? body.entityId : null,
      template: body.template ?? null,
      country: req.headers.get("cf-ipcountry") ?? "unknown",
      device: body.device ?? "unknown",
    });

    const res = NextResponse.json({ ok: true, eventId: event.event_id });
    if (!req.cookies.get("roamola_session")) {
      res.cookies.set("roamola_session", sessionId, {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        maxAge: 60 * 60 * 24 * 365,
      });
    }
    return res;
  } catch (err) {
    // Never let a malformed event or a down warehouse break the page it
    // fired from -- log and 200 with ok:false rather than surfacing to the
    // visitor. The admin system-check page is the place to see failures.
    console.error("event ingest failed", err);
    return NextResponse.json({ ok: false, error: String(err) }, { status: 200 });
  }
}

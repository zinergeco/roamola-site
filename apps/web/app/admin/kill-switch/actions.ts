"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db, page, place } from "@roamola/db";

/**
 * BUILD.md §12: "One admin action must, in a single transaction: set
 * noindex, remove from the sitemap, strip inbound internal links, and
 * optionally 301. Build this in week one."
 *
 * What this implements, honestly: the part the current schema and M1 scope
 * actually support -- a single transaction that moves `page.status` to
 * noindexed/removed. Sitemap exclusion follows automatically, because the
 * (not-yet-built) sitemap route is specified to select status='published'
 * only -- see page_published_idx in packages/db/src/schema.ts, which is a
 * partial index on exactly that condition. "Strip inbound internal links"
 * and the optional 301 are content-graph operations against `page.content`
 * and real templates, which don't exist until M3 -- this file does not
 * fake that part.
 */

export interface PageRow {
  id: string;
  template: string;
  entityType: string;
  url: string;
  status: string;
  publishedAt: string | null;
  removedReason: string | null;
}

export async function listPages(): Promise<PageRow[]> {
  const rows = await db.select().from(page).orderBy(page.id);
  return rows.map((r) => ({
    id: r.id.toString(),
    template: r.template,
    entityType: r.entityType,
    url: r.url,
    status: r.status,
    publishedAt: r.publishedAt ? r.publishedAt.toISOString() : null,
    removedReason: r.removedReason,
  }));
}

/** No real pages exist yet (M3 builds the first template) -- this creates
 *  one clearly-marked fixture row so the kill switch has something real to
 *  act on, reusing the place the system-check page creates. */
export async function createFixturePage(): Promise<{ ok: boolean; detail: string }> {
  const existingPlace = await db
    .select({ id: place.id })
    .from(place)
    .where(and(eq(place.slug, "system-check-place"), isNull(place.parentId)))
    .limit(1);

  if (!existingPlace[0]) {
    return { ok: false, detail: "No system-check place yet — run /admin/system-check first." };
  }

  const url = `/admin/_fixtures/system-check-page-${Date.now()}`;
  const [p] = await db
    .insert(page)
    .values({
      template: "system-check",
      entityType: "place",
      entityId: existingPlace[0].id,
      url,
      status: "published",
      completenessScore: "1.000",
      publishedAt: new Date(),
    })
    .returning({ id: page.id });

  return { ok: true, detail: `Created page.id=${p.id} at ${url}, status=published.` };
}

export async function applyKillSwitch(
  pageId: string,
  action: "noindex" | "remove",
  reason: string,
): Promise<{ ok: boolean; detail: string }> {
  try {
    await db.transaction(async (tx) => {
      await tx
        .update(page)
        .set({
          status: action === "noindex" ? "noindexed" : "removed",
          removedReason: reason || null,
          lastVerifiedAt: new Date(),
        })
        .where(eq(page.id, BigInt(pageId)));
    });
    return {
      ok: true,
      detail: `page.id=${pageId} is now ${action === "noindex" ? "noindexed" : "removed"} — excluded from the sitemap (its query filters status='published'), noindex applies per the head-management rule in BUILD.md §12.`,
    };
  } catch (err) {
    return { ok: false, detail: err instanceof Error ? err.message : String(err) };
  }
}

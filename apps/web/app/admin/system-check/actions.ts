"use server";

import { and, eq, isNull } from "drizzle-orm";
import { db, place, signal, source } from "@roamola/db";
import { ensureEventTable, readEventById, writeEvent } from "@roamola/analytics";

/**
 * BUILD.md §15, M1's own acceptance test, verbatim:
 *
 *   "Done when: you can insert a place, attach a signal, fail to update
 *    that signal, and see an event in ClickHouse."
 *
 * This runs that test for real against production Postgres + ClickHouse,
 * on demand, from the admin shell -- rather than being a one-off script
 * that proved M1 once and was then thrown away.
 */

export interface CheckStep {
  name: string;
  ok: boolean;
  detail: string;
  ms: number;
}

export interface SystemCheckResult {
  ranAt: string;
  steps: CheckStep[];
  allPassed: boolean;
}

async function timed(name: string, fn: () => Promise<string>): Promise<CheckStep> {
  const start = Date.now();
  try {
    const detail = await fn();
    return { name, ok: true, detail, ms: Date.now() - start };
  } catch (err) {
    return { name, ok: false, detail: err instanceof Error ? err.message : String(err), ms: Date.now() - start };
  }
}

export async function runSystemCheck(): Promise<SystemCheckResult> {
  const steps: CheckStep[] = [];

  const sourceStep = await timed("Insert a source (provenance register, BUILD.md §0 rule 2)", async () => {
    const [src] = await db
      .insert(source)
      .values({
        slug: "system-check",
        name: "Admin system-check fixture",
        url: "https://roamola.com/admin/system-check",
        licence: "internal",
        commercialUse: true,
        redistributable: false,
        refreshInterval: "1 day",
        lastSuccessAt: new Date(),
        active: true,
      })
      .onConflictDoUpdate({
        target: source.slug,
        set: { lastSuccessAt: new Date() },
      })
      .returning({ id: source.id });
    return `source.id = ${src.id}`;
  });
  steps.push(sourceStep);
  if (!sourceStep.ok) return finish(steps);

  const sourceId = Number(sourceStep.detail.match(/= (\d+)/)?.[1]);

  const placeStep = await timed("Insert a place (find-or-create -- geography is first-class, BUILD.md §1)", async () => {
    const existing = await db
      .select({ id: place.id })
      .from(place)
      .where(and(eq(place.slug, "system-check-place"), isNull(place.parentId)))
      .limit(1);

    if (existing[0]) return `place.id = ${existing[0].id} (reused from a previous run)`;

    const [p] = await db
      .insert(place)
      .values({
        type: "system-check",
        slug: "system-check-place",
        canonicalName: "System Check Fixture",
        countryCode: "XX",
        timezone: "UTC",
        centroid: "SRID=4326;POINT(0 0)",
        sourceId,
      })
      .returning({ id: place.id });
    return `place.id = ${p.id} (newly inserted)`;
  });
  steps.push(placeStep);
  if (!placeStep.ok) return finish(steps);

  const placeId = BigInt(placeStep.detail.match(/= (\d+)/)?.[1] ?? "0");

  const signalStep = await timed("Attach a signal to that place (append-only table, BUILD.md §0 rule 3)", async () => {
    const [s] = await db
      .insert(signal)
      .values({
        entityType: "place",
        entityId: placeId,
        metric: "system_check",
        value: "1",
        unit: "count",
        observedAt: new Date(),
        sourceId,
      })
      .returning({ id: signal.id });
    return `signal.id = ${s.id}`;
  });
  steps.push(signalStep);
  if (!signalStep.ok) return finish(steps);

  const signalId = BigInt(signalStep.detail.match(/= (\d+)/)?.[1] ?? "0");

  // This step is expected to FAIL -- `ok: true` here means the UPDATE was
  // correctly rejected by the trigger, not that it succeeded.
  const updateStep = await (async (): Promise<CheckStep> => {
    const start = Date.now();
    try {
      await db.update(signal).set({ value: "999" }).where(eq(signal.id, signalId));
      return {
        name: "Fail to update that signal (trigger should reject this)",
        ok: false,
        detail: "UPDATE succeeded -- the append-only trigger did not fire. This is a real bug.",
        ms: Date.now() - start,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const rejectedByTrigger = /append-only/i.test(message);
      return {
        name: "Fail to update that signal (trigger should reject this)",
        ok: rejectedByTrigger,
        detail: rejectedByTrigger
          ? `Rejected as expected: ${message}`
          : `Rejected, but not by the expected trigger: ${message}`,
        ms: Date.now() - start,
      };
    }
  })();
  steps.push(updateStep);

  const eventStep = await timed("Fire an event and see it land in ClickHouse", async () => {
    await ensureEventTable();
    const written = await writeEvent({
      type: "page_view",
      payload: { template: "admin.system-check", entityId: Number(placeId) },
      sessionId: "system-check",
      entityType: "place",
      entityId: Number(placeId),
      template: "admin.system-check",
    });
    const readBack = await readEventById(written.event_id);
    if (!readBack) throw new Error(`wrote event ${written.event_id} but could not read it back`);
    return `event_id = ${readBack.event_id} (round-tripped through ClickHouse)`;
  });
  steps.push(eventStep);

  return finish(steps);
}

function finish(steps: CheckStep[]): SystemCheckResult {
  return {
    ranAt: new Date().toISOString(),
    steps,
    allPassed: steps.length === 5 && steps.every((s) => s.ok),
  };
}

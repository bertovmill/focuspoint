import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  dayKey,
  getScorecardSummary,
  recordMetrics,
  setFastingHeld,
  type MetricPatch,
} from "@/lib/scorecard";

// The daily scorecard — see lib/scorecard.ts for what makes a day a win.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getScorecardSummary(getDb()));
  } catch (err) {
    console.error("scorecard read failed:", err);
    return NextResponse.json({ error: "Failed to load scorecard" }, { status: 500 });
  }
}

/** A number the user typed, or null to clear it. Anything unparseable is ignored. */
function optionalNumber(raw: unknown): number | null | undefined {
  if (raw === undefined) return undefined;
  if (raw === null || raw === "") return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

/**
 * Patch today (or an explicit `date`). Only the keys present in the body move, so
 * the health sync and a manual tap can't overwrite each other.
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const date = typeof body.date === "string" && body.date ? body.date : dayKey(new Date());
    const sql = getDb();

    const patch: MetricPatch = {};
    const steps = optionalNumber(body.steps);
    if (steps !== undefined) patch.steps = steps;
    const sleep = optionalNumber(body.sleep_minutes);
    if (sleep !== undefined) patch.sleep_minutes = sleep;
    // Meditation arrives here from the iOS Shortcut (Apple Health mindful minutes),
    // since Insight Timer has no API. It authenticates with the ordinary session
    // cookie rather than a bearer token, so no middleware allowance is needed.
    const meditation = optionalNumber(body.meditation_minutes);
    if (meditation !== undefined) patch.meditation_minutes = meditation;
    const notes = optionalNumber(body.readwise_notes);
    if (notes !== undefined) patch.readwise_notes = notes;
    const portfolio = optionalNumber(body.portfolio);
    if (portfolio !== undefined) patch.portfolio = portfolio;

    if (Object.keys(patch).length) await recordMetrics(sql, date, patch);
    // Fasting is stored on the nutrition protocol, not daily_metrics.
    if (typeof body.fasting_held === "boolean") await setFastingHeld(sql, date, body.fasting_held);

    return NextResponse.json(await getScorecardSummary(sql));
  } catch (err) {
    console.error("scorecard write failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

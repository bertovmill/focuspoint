import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dayKey, getScorecardSummary, recordMetrics, type MetricPatch } from "@/lib/scorecard";

// The daily scorecard — see lib/scorecard.ts for what makes a day a win.

export const dynamic = "force-dynamic";

/** `?date=YYYY-MM-DD` looks at an earlier day; no date (or a future one) is today. */
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date") ?? undefined;
    return NextResponse.json(await getScorecardSummary(getDb(), date));
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
 * the health sync and a manual correction can't overwrite each other.
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

    if (Object.keys(patch).length) await recordMetrics(sql, date, patch);

    // Answer for the day that was edited, so a correction to yesterday stays on yesterday.
    return NextResponse.json(await getScorecardSummary(sql, date));
  } catch (err) {
    console.error("scorecard write failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

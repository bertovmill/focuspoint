import { NextResponse } from "next/server";

import { debugHealthDay, isHealthConnected } from "@/lib/google-health";
import { syncHealthRange } from "@/lib/health-sync";
import { dayKey } from "@/lib/scorecard";

export const dynamic = "force-dynamic";

/**
 * Whether Google is connected, and — with `?debug=YYYY-MM-DD` — the raw rollup for
 * one day. The debug view exists because the per-type response field names are the
 * one part of the Health API the docs don't pin down; it's how we confirm the real
 * shape against real data instead of guessing.
 */
export async function GET(req: Request) {
  const debug = new URL(req.url).searchParams.get("debug");
  if (debug) {
    return NextResponse.json(await debugHealthDay(debug === "today" ? dayKey(new Date()) : debug));
  }
  try {
    return NextResponse.json({ connected: await isHealthConnected() });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

/**
 * Pull recent days. Defaults to 3 — today plus a two-day tail, because the watch
 * often uploads last night's sleep well after midnight.
 */
export async function POST(req: Request) {
  try {
    const days = await req
      .json()
      .then((b: { days?: number }) => Math.min(Math.max(Number(b?.days) || 3, 1), 90))
      .catch(() => 3);
    return NextResponse.json(await syncHealthRange(days));
  } catch (err) {
    console.error("Google Health sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

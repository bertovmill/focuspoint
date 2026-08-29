import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isFitbitConnected } from "@/lib/fitbit";
import { syncFitbitRange } from "@/lib/fitbit-sync";

export const dynamic = "force-dynamic";

/** Whether Fitbit is connected — the card uses this to show connect vs sync. */
export async function GET() {
  try {
    return NextResponse.json({ connected: await isFitbitConnected(getDb()) });
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
    return NextResponse.json(await syncFitbitRange(days));
  } catch (err) {
    console.error("Fitbit sync failed:", err);
    return NextResponse.json({ error: "Sync failed" }, { status: 500 });
  }
}

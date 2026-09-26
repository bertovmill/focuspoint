import { NextResponse } from "next/server";
import { syncStrava } from "@/lib/training";

export const maxDuration = 60;

// POST { days? } — pull recent activities and mark planned sessions done.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || 14, 1), 90);
    return NextResponse.json(await syncStrava(days));
  } catch (err) {
    console.error("[api/strava/sync]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}

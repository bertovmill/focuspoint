import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isHealthConnected } from "@/lib/google-health";
import { syncWorkouts } from "@/lib/training";
import { getWorkoutHeartRates } from "@/lib/workout-heart-rate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET ?days=30 — recent Fitbit workouts with the heart-rate curve inside each.
export async function GET(req: Request) {
  try {
    const days = Math.min(Math.max(Number(new URL(req.url).searchParams.get("days")) || 30, 1), 90);
    // Workouts synced before 2026-11-01 have no UTC interval to fetch samples on; a
    // re-sync fills it in. Only when some are missing, so a normal view stays fast.
    const [gap] = await getDb()`
      SELECT 1 FROM fitbit_exercises WHERE start_utc IS NULL AND start_local >= (CURRENT_DATE - ${days}::int) LIMIT 1
    `;
    if (gap && (await isHealthConnected().catch(() => false))) await syncWorkouts(days).catch(() => null);
    return NextResponse.json(await getWorkoutHeartRates(days));
  } catch (err) {
    console.error("[api/training/heart-rate]", err);
    return NextResponse.json({ error: "Couldn't load heart rate" }, { status: 500 });
  }
}

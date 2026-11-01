import { NextResponse } from "next/server";
import { syncHealthRange } from "@/lib/health-sync";
import { syncWorkouts } from "@/lib/training";
import { getWorkoutHeartRates } from "@/lib/workout-heart-rate";

// The daily watch sync (vercel.json cron, ~9am Toronto). Before this, sleep only
// synced when Home was open and only looked back 3 days, so a few days away from
// the app left gaps in "Sleep this week" (Berto, 2026-11-01: "a steady stream of
// daily sleep"). A week back covers sleep the watch uploads late; workouts and
// their heart-rate curves ride along.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const health = await syncHealthRange(7).catch((err) => ({ error: String(err) }));
  const workouts = await syncWorkouts(14).catch((err) => ({ error: String(err) }));
  const heartRate = await getWorkoutHeartRates(14)
    .then((r) => ({ needsReconnect: r.needsReconnect, withCurve: r.workouts.filter((w) => w.samples.length).length }))
    .catch((err) => ({ error: String(err) }));
  return NextResponse.json({ health, workouts, heartRate });
}

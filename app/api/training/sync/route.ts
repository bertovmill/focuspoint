import { NextResponse } from "next/server";
import { lastWorkoutSync, syncWorkouts } from "@/lib/training";
import { isHealthConnected } from "@/lib/google-health";

export const maxDuration = 60;

// GET — is the watch connected, and when were workouts last pulled.
export async function GET() {
  const [connected, last_synced_at] = await Promise.all([isHealthConnected().catch(() => false), lastWorkoutSync().catch(() => null)]);
  return NextResponse.json({ connected, last_synced_at });
}

// POST { days? } — pull recent Fitbit workouts and mark planned sessions done.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const days = Math.min(Math.max(Number(body?.days) || 14, 1), 90);
    return NextResponse.json(await syncWorkouts(days));
  } catch (err) {
    console.error("[api/training/sync]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Sync failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { disconnectStrava, isStravaConnected, stravaConfigured } from "@/lib/strava";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const [connected, last] = await Promise.all([
      isStravaConnected(),
      getDb()`SELECT MAX(synced_at) AS at FROM strava_activities`,
    ]);
    return NextResponse.json({ configured: stravaConfigured(), connected, last_synced_at: last[0]?.at ?? null });
  } catch {
    return NextResponse.json({ configured: stravaConfigured(), connected: false, last_synced_at: null });
  }
}

export async function DELETE() {
  await disconnectStrava();
  return NextResponse.json({ ok: true });
}

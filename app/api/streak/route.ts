import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { DAILY_GOAL_DEFAULT, getStreakSummary, RECENT_DAYS, type StreakSummary } from "@/lib/streak";

// The streak + points the whole app scores itself on. See lib/streak.ts for what
// makes a day count (finishing `daily_goal` tasks, not just one).

export const dynamic = "force-dynamic";

/** What we hand back when the DB is unreachable — a zeroed board, not a 500. */
function emptySummary(): StreakSummary {
  return {
    streak: 0,
    bestStreak: 0,
    doneToday: 0,
    goal: DAILY_GOAL_DEFAULT,
    todayHit: false,
    atRisk: false,
    pointsToday: 0,
    totalPoints: 0,
    recent: Array.from({ length: RECENT_DAYS }, () => ({ date: "", tasks: 0, points: 0, hit: false })),
  };
}

export async function GET() {
  try {
    return NextResponse.json(await getStreakSummary(getDb()));
  } catch {
    return NextResponse.json(emptySummary());
  }
}

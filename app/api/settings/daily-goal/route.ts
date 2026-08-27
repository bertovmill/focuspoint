import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  clampDailyGoal,
  DAILY_GOAL_DEFAULT,
  DAILY_GOAL_MAX,
  DAILY_GOAL_MIN,
  getDailyGoal,
  setDailyGoal,
} from "@/lib/streak";

// How many tasks a day needs for the streak to count it. Set from the streak chip
// on the Tasks board; lib/streak.ts is the only thing that reads it.

export async function GET() {
  try {
    const goal = await getDailyGoal(getDb());
    return NextResponse.json({ goal, min: DAILY_GOAL_MIN, max: DAILY_GOAL_MAX });
  } catch {
    return NextResponse.json({ goal: DAILY_GOAL_DEFAULT, min: DAILY_GOAL_MIN, max: DAILY_GOAL_MAX });
  }
}

export async function PUT(req: Request) {
  try {
    const { goal } = await req.json();
    // Raising the goal can retroactively break today's "hit" — that's honest: the
    // bar you set is the bar the day is measured against.
    const saved = await setDailyGoal(getDb(), clampDailyGoal(goal));
    return NextResponse.json({ goal: saved, min: DAILY_GOAL_MIN, max: DAILY_GOAL_MAX });
  } catch {
    return NextResponse.json({ error: "Failed to save the daily goal" }, { status: 500 });
  }
}

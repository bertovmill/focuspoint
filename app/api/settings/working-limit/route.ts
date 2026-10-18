import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import {
  clampWorkingLimit,
  getWorkingLimit,
  setWorkingLimit,
  WORKING_LIMIT_DEFAULT,
  WORKING_LIMIT_MAX,
  WORKING_LIMIT_MIN,
} from "@/lib/working-now";

// How many tasks Berto lets himself have in flight at once. Five most days, one
// on a day where one thing matters. Set from the pinned window; the whole app
// (board, API, agent tools) reads the same number.

export async function GET() {
  try {
    const limit = await getWorkingLimit(getDb());
    return NextResponse.json({ limit, min: WORKING_LIMIT_MIN, max: WORKING_LIMIT_MAX });
  } catch {
    return NextResponse.json({ limit: WORKING_LIMIT_DEFAULT, min: WORKING_LIMIT_MIN, max: WORKING_LIMIT_MAX });
  }
}

export async function PUT(req: Request) {
  try {
    const { limit } = await req.json();
    // Lowering the limit never touches what's already running — the tasks in
    // flight stay in flight, and only new ones are blocked until he's back under.
    const saved = await setWorkingLimit(getDb(), clampWorkingLimit(limit));
    return NextResponse.json({ limit: saved, min: WORKING_LIMIT_MIN, max: WORKING_LIMIT_MAX });
  } catch {
    return NextResponse.json({ error: "Failed to save the limit" }, { status: 500 });
  }
}

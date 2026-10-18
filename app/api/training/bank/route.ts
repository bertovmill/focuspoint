import { NextResponse } from "next/server";
import { listWorkouts, saveWorkout } from "@/lib/workout-bank";

// GET → every workout in the bank (not archived), in order
export async function GET() {
  try {
    return NextResponse.json(await listWorkouts());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 500 });
  }
}

// POST { name, session_type, default_day, plan, warmup, cooldown, blocks } → the new workout
export async function POST(req: Request) {
  try {
    return NextResponse.json(await saveWorkout(await req.json()));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}

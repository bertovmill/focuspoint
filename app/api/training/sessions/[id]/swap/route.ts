import { NextResponse } from "next/server";
import { swapSessionWorkout } from "@/lib/workout-bank";

type Params = { params: Promise<{ id: string }> };

// POST { workout_slug, scope: "one" | "following" } — swap this session for another
// bank workout; "following" also swaps later unfinished sessions and the default week.
export async function POST(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const { workout_slug, scope } = await req.json();
    if (typeof workout_slug !== "string" || !workout_slug) return NextResponse.json({ error: "Pick a workout" }, { status: 400 });
    const swapped = await swapSessionWorkout(Number(id), workout_slug, scope === "following" ? "following" : "one");
    return NextResponse.json({ ok: true, swapped });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't swap" }, { status: 400 });
  }
}

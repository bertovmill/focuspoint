import { NextResponse } from "next/server";
import { getGoal, setGoal, DEFAULT_GOAL } from "@/lib/training";

export async function GET() {
  try {
    return NextResponse.json({ goal: await getGoal() });
  } catch {
    return NextResponse.json({ goal: DEFAULT_GOAL });
  }
}

// PUT { goal } — one sentence.
export async function PUT(req: Request) {
  try {
    const { goal } = await req.json();
    if (typeof goal !== "string" || !goal.trim()) return NextResponse.json({ error: "goal must be a non-empty string" }, { status: 400 });
    return NextResponse.json({ goal: await setGoal(goal.trim().slice(0, 300)) });
  } catch {
    return NextResponse.json({ error: "Couldn't save the goal" }, { status: 500 });
  }
}

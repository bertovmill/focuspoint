import { NextResponse } from "next/server";
import { addTodaysNavalMoves, getNavalStatus, setNavalMoveDone } from "@/lib/naval";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getNavalStatus());
  } catch {
    return NextResponse.json({ error: "Failed to load Naval" }, { status: 500 });
  }
}

// { action: "add" } puts today's moves on the board (any day, for a missed cron
// or a weekend); { taskId, done } ticks or unticks one.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    if (body.action === "add") await addTodaysNavalMoves({ force: true });
    else if (Number.isFinite(Number(body.taskId))) await setNavalMoveDone(Number(body.taskId), Boolean(body.done));
    else return NextResponse.json({ error: "Nothing to do" }, { status: 400 });
    return NextResponse.json(await getNavalStatus());
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { fillWeekFromBank } from "@/lib/workout-bank";
import { weekStartISO } from "@/lib/nutrition";

// POST { week_start } — "Fill from bank": replace the week's unfinished sessions
// with the workout bank's default lineup (done sessions stay).
export async function POST(req: Request) {
  try {
    const { week_start } = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(week_start))) return NextResponse.json({ error: "Bad week" }, { status: 400 });
    const filled = await fillWeekFromBank(weekStartISO(week_start), { replace: true });
    if (!filled) return NextResponse.json({ error: "Only this week or a later one can be filled" }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't fill the week" }, { status: 500 });
  }
}

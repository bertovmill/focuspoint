import { NextResponse } from "next/server";
import { getCareerPlan, isISODate, setDestination } from "@/lib/career-plan";
import { todayISO } from "@/lib/nutrition";

// GET ?today=&from=&to= — the client sends its own today, since the server runs in UTC.
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const today = isISODate(q.get("today")) ? q.get("today")! : todayISO();
  const from = isISODate(q.get("from")) ? q.get("from")! : today;
  const to = isISODate(q.get("to")) ? q.get("to")! : today;
  try {
    return NextResponse.json(await getCareerPlan(today, from, to));
  } catch {
    return NextResponse.json({ error: "Couldn't load the career plan" }, { status: 500 });
  }
}

// PUT { goal?, target_date?: "YYYY-MM-DD" | null, today? } — the destination.
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const today = isISODate(body?.today) ? body.today : todayISO();
    if (body.goal !== undefined && (typeof body.goal !== "string" || !body.goal.trim())) {
      return NextResponse.json({ error: "goal must be a non-empty string" }, { status: 400 });
    }
    if (body.target_date !== undefined && body.target_date !== null && !isISODate(body.target_date)) {
      return NextResponse.json({ error: "target_date must be YYYY-MM-DD or null" }, { status: 400 });
    }
    return NextResponse.json(await setDestination({ goal: body.goal, target_date: body.target_date }, today));
  } catch {
    return NextResponse.json({ error: "Couldn't save the destination" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { type CheckinDay, dayISO, getChips, hasCheckedIn, mealsOn, saveCheckin, weekSummary } from "@/lib/yesterday-meals";

export const maxDuration = 60;

function parseDay(v: string | null | undefined): CheckinDay {
  return v === "today" ? "today" : "yesterday";
}

// GET ?day=yesterday|today → { day, date, logged, meals, chips, week }
// `logged` is whether the yesterday check-in itself is already in; `meals` is
// everything on the day so far, so the dialog can show it and ask for the rest.
export async function GET(req: Request) {
  try {
    const day = parseDay(new URL(req.url).searchParams.get("day"));
    const date = dayISO(day);
    const [logged, meals, chips, week] = await Promise.all([hasCheckedIn(date), mealsOn(date), getChips(), weekSummary(date)]);
    return NextResponse.json({ day, date, logged, meals, chips, week });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 500 });
  }
}

// POST { text, sweets, day? } → CheckinResult + refreshed week summary
export async function POST(req: Request) {
  try {
    const { text, sweets, day } = (await req.json()) as { text?: string; sweets?: boolean; day?: string };
    if (!text?.trim()) return NextResponse.json({ error: "Say what you ate" }, { status: 400 });
    const result = await saveCheckin(text.trim(), Boolean(sweets), parseDay(day));
    const week = await weekSummary(result.date);
    return NextResponse.json({ ...result, week });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 500 });
  }
}

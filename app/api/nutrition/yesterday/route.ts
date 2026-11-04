import { NextResponse } from "next/server";
import { getChips, hasLoggedOn, saveCheckin, weekSummary, yesterdayISO } from "@/lib/yesterday-meals";

export const maxDuration = 60;

// GET → { date, logged, chips, week } — what the first-open check-in needs to render
export async function GET() {
  try {
    const date = yesterdayISO();
    const [logged, chips, week] = await Promise.all([hasLoggedOn(date), getChips(), weekSummary(date)]);
    return NextResponse.json({ date, logged, chips, week });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 500 });
  }
}

// POST { text, sweets } → CheckinResult + refreshed week summary
export async function POST(req: Request) {
  try {
    const { text, sweets } = (await req.json()) as { text?: string; sweets?: boolean };
    if (!text?.trim()) return NextResponse.json({ error: "Say what you ate" }, { status: 400 });
    const result = await saveCheckin(text.trim(), Boolean(sweets));
    const week = await weekSummary(result.date);
    return NextResponse.json({ ...result, week });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { weeklyProgress } from "@/lib/progress";
import { todayISO } from "@/lib/nutrition";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET ?today=YYYY-MM-DD → { change, items }: this week's sets against the last time
// each workout was done. The client sends its own date so the week is his local week.
export async function GET(req: Request) {
  try {
    const today = new URL(req.url).searchParams.get("today") ?? todayISO();
    if (!ISO.test(today)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    return NextResponse.json(await weeklyProgress(today));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 500 });
  }
}

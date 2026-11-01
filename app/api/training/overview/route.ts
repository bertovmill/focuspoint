import { NextResponse } from "next/server";
import { trainingOverview } from "@/lib/training-overview";
import { todayISO } from "@/lib/nutrition";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET ?today=YYYY-MM-DD → the Progress tab: stat tiles, Dec 31 goals, weekly trends.
// The client sends its own date so months and weeks are his local ones.
export async function GET(req: Request) {
  try {
    const today = new URL(req.url).searchParams.get("today") ?? todayISO();
    if (!ISO.test(today)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    return NextResponse.json(await trainingOverview(today));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 500 });
  }
}

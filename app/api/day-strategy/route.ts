import { NextResponse } from "next/server";
import { generateDayStrategy, getDayStrategy, setDayStrategyStatus } from "@/lib/day-strategy";

// Home's "Today's strategy" block (lib/day-strategy.ts).
// The model call takes a few seconds; give it room.
export const maxDuration = 60;

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

// GET ?day=YYYY-MM-DD — the saved strategy for that day, or null.
export async function GET(req: Request) {
  const day = new URL(req.url).searchParams.get("day") ?? "";
  if (!DAY_RE.test(day)) return NextResponse.json({ error: "day is required" }, { status: 400 });
  try {
    return NextResponse.json(await getDayStrategy(day));
  } catch {
    return NextResponse.json({ error: "Couldn't load the strategy" }, { status: 500 });
  }
}

// POST { day, timeMin, timeMax, timeZone, feedback? } — writes a new suggestion for the day.
export async function POST(req: Request) {
  try {
    const { day, timeMin, timeMax, timeZone, feedback } = await req.json();
    if (!DAY_RE.test(day ?? "") || typeof timeMin !== "string" || typeof timeMax !== "string" || typeof timeZone !== "string") {
      return NextResponse.json({ error: "day, timeMin, timeMax and timeZone are required" }, { status: 400 });
    }
    const note = typeof feedback === "string" && feedback.trim() ? feedback.trim().slice(0, 1000) : undefined;
    return NextResponse.json(await generateDayStrategy({ day, timeMin, timeMax, timeZone }, note));
  } catch (err) {
    console.error("Day strategy failed:", err);
    return NextResponse.json({ error: "Couldn't write a strategy" }, { status: 500 });
  }
}

// PATCH { day, status: "accepted" | "proposed" } — his yes, or reopening it.
export async function PATCH(req: Request) {
  try {
    const { day, status } = await req.json();
    if (!DAY_RE.test(day ?? "") || (status !== "accepted" && status !== "proposed")) {
      return NextResponse.json({ error: "day and status are required" }, { status: 400 });
    }
    return NextResponse.json(await setDayStrategyStatus(day, status));
  } catch {
    return NextResponse.json({ error: "Couldn't save that" }, { status: 500 });
  }
}

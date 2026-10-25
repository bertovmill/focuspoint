import { NextResponse } from "next/server";
import { generateDayStrategy, getDayStrategy, updateStrategyBlock } from "@/lib/day-strategy";

// The day's strategy on Home's calendar (lib/day-strategy.ts).
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

// PATCH { day, index, state?: "suggested" | "kept" | "dropped", done?: boolean } — keep, drop or tick one activity.
export async function PATCH(req: Request) {
  try {
    const { day, index, state, done } = await req.json();
    const patch: { state?: "suggested" | "kept" | "dropped"; done?: boolean } = {};
    if (state === "suggested" || state === "kept" || state === "dropped") patch.state = state;
    if (typeof done === "boolean") patch.done = done;
    if (!DAY_RE.test(day ?? "") || !Number.isInteger(index) || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "day, index and a state or done are required" }, { status: 400 });
    }
    const updated = await updateStrategyBlock(day, index, patch);
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Couldn't save that" }, { status: 500 });
  }
}

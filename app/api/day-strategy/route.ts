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

const HHMM_RE = /^([01]\d|2[0-4]):[0-5]\d$/;

// PATCH { day, index, state?: "suggested" | "kept" | "dropped", done?: boolean, start?, end? }
// — keep, drop or tick one activity, or move it (start and end together, "HH:MM", dragged on Home).
export async function PATCH(req: Request) {
  try {
    const { day, index, state, done, start, end } = await req.json();
    const patch: { state?: "suggested" | "kept" | "dropped"; done?: boolean; start?: string; end?: string } = {};
    if (state === "suggested" || state === "kept" || state === "dropped") patch.state = state;
    if (typeof done === "boolean") patch.done = done;
    if (HHMM_RE.test(start ?? "") && HHMM_RE.test(end ?? "") && start < end) Object.assign(patch, { start, end });
    if (!DAY_RE.test(day ?? "") || !Number.isInteger(index) || Object.keys(patch).length === 0) {
      return NextResponse.json({ error: "day, index and a state, done or start/end are required" }, { status: 400 });
    }
    const updated = await updateStrategyBlock(day, index, patch);
    return updated ? NextResponse.json(updated) : NextResponse.json({ error: "Not found" }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Couldn't save that" }, { status: 500 });
  }
}

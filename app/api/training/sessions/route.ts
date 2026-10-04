import { NextResponse } from "next/server";
import { getActivities, getSessions, saveSession } from "@/lib/training";
import { fillWeekFromBank } from "@/lib/workout-bank";
import { addDaysISO } from "@/lib/nutrition";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from=&to= → { sessions, activities } for the range
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from") ?? "";
    const to = searchParams.get("to") ?? "";
    if (!ISO.test(from) || !ISO.test(to)) return NextResponse.json({ error: "Bad range" }, { status: 400 });
    // A whole week, this one or later, that's still empty fills from the workout bank's default days.
    if (to === addDaysISO(from, 6)) await fillWeekFromBank(from).catch(() => false);
    const [sessions, activities] = await Promise.all([getSessions(from, to), getActivities(from, to)]);
    return NextResponse.json({ sessions, activities });
  } catch {
    return NextResponse.json({ sessions: [], activities: [] });
  }
}

// POST { session_date, type, title?, target_km?, target_minutes?, target_pace_sec?, intensity?, notes? } — new session
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!ISO.test(String(body?.session_date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    const row = await saveSession({
      session_date: body.session_date,
      type: String(body.type ?? ""),
      title: body.title,
      target_km: body.target_km === "" || body.target_km == null ? null : Number(body.target_km),
      target_minutes: body.target_minutes === "" || body.target_minutes == null ? null : Math.round(Number(body.target_minutes)),
      target_pace_sec: body.target_pace_sec === "" || body.target_pace_sec == null ? null : Number(body.target_pace_sec),
      intensity: body.intensity ?? null,
      notes: typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null,
      workout_slug: body.workout_slug === undefined ? undefined : body.workout_slug || null,
    });
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { gcalFetch } from "@/lib/google";

// Skip logging blips (e.g. an accidental start/stop) to the calendar.
const MIN_LOGGED_DURATION_MS = 60_000;

// Best-effort: log the worked interval to the primary Google Calendar so time
// spent shows up there too. Never let a calendar failure block the timer stop.
async function logTimeToCalendar(title: string, start: Date, end: Date) {
  if (end.getTime() - start.getTime() < MIN_LOGGED_DURATION_MS) return;
  try {
    await gcalFetch(`/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify({
        summary: title,
        start: { dateTime: start.toISOString() },
        end: { dateTime: end.toISOString() },
      }),
    });
  } catch (err) {
    console.error("Failed to log worked time to calendar:", err);
  }
}

// One timer at a time: starting a task stops (and banks) any other running timer.
// Starting also marks the task in progress; stopping leaves in_progress alone.
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { action } = await req.json();
    if (action !== "start" && action !== "stop") {
      return NextResponse.json({ error: "action must be 'start' or 'stop'" }, { status: 400 });
    }
    const sql = getDb();

    if (action === "start") {
      const bumped = await sql`
        UPDATE todos
        SET time_spent_seconds = time_spent_seconds + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int,
            timer_started_at = NULL
        WHERE timer_started_at IS NOT NULL AND id <> ${id}
        RETURNING title, timer_started_at AS started_at
      `;
      const now = new Date();
      for (const t of bumped) {
        await logTimeToCalendar(t.title, new Date(t.started_at), now);
      }
      const [row] = await sql`
        UPDATE todos
        SET timer_started_at = COALESCE(timer_started_at, NOW()), in_progress = TRUE
        WHERE id = ${id}
        RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
      `;
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }

    const [before] = await sql`SELECT title, timer_started_at FROM todos WHERE id = ${id}`;
    const stopNow = new Date();
    const [row] = await sql`
      UPDATE todos
      SET time_spent_seconds = time_spent_seconds + CASE
            WHEN timer_started_at IS NULL THEN 0
            ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int
          END,
          timer_started_at = NULL
      WHERE id = ${id}
      RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    if (before?.timer_started_at) {
      await logTimeToCalendar(before.title, new Date(before.timer_started_at), stopNow);
    }
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update timer" }, { status: 500 });
  }
}

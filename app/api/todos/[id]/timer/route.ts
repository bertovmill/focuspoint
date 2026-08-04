import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

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
      await sql`
        UPDATE todos
        SET time_spent_seconds = time_spent_seconds + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int,
            timer_started_at = NULL
        WHERE timer_started_at IS NOT NULL AND id <> ${id}
      `;
      const [row] = await sql`
        UPDATE todos
        SET timer_started_at = COALESCE(timer_started_at, NOW()), in_progress = TRUE
        WHERE id = ${id}
        RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number
      `;
      if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
      return NextResponse.json(row);
    }

    const [row] = await sql`
      UPDATE todos
      SET time_spent_seconds = time_spent_seconds + CASE
            WHEN timer_started_at IS NULL THEN 0
            ELSE GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int
          END,
          timer_started_at = NULL
      WHERE id = ${id}
      RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update timer" }, { status: 500 });
  }
}

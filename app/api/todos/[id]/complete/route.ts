import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logCompletedTaskToCalendar } from "@/lib/task-calendar";
import { TASK_CATEGORY_LABELS, normalizeCategory } from "@/lib/task-categories";

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();

    const [todo] = await sql`SELECT recurrence FROM todos WHERE id = ${id}`;
    if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Completing a task banks any running timer into time_spent_seconds.
    await sql`
      UPDATE todos
      SET time_spent_seconds = time_spent_seconds + GREATEST(0, EXTRACT(EPOCH FROM (NOW() - timer_started_at)))::int,
          timer_started_at = NULL
      WHERE id = ${id} AND timer_started_at IS NOT NULL
    `;

    // Read back after banking the timer so the calendar block reflects the final time.
    const [finished] = await sql`
      SELECT title, time_spent_seconds, estimated_minutes, category FROM todos WHERE id = ${id}
    `;

    const recurring = Boolean(todo.recurrence && todo.recurrence !== "none");
    let next_due: string | null = null;
    if (recurring) {
      next_due = nextDueDate(todo.recurrence);
      await sql`UPDATE todos SET due_date = ${next_due}, completed_at = NOW(), in_progress = FALSE WHERE id = ${id}`;
    } else {
      // A finished task gives up its queue slot.
      await sql`UPDATE todos SET completed = TRUE, completed_at = NOW(), in_progress = FALSE, task_number = NULL WHERE id = ${id}`;
    }

    // Plot the finished work onto Google Calendar so past weeks can be audited.
    // Best-effort: a null event id just means nothing was written.
    const category = normalizeCategory(finished?.category);
    const eventId = await logCompletedTaskToCalendar({
      title: finished?.title ?? "Task",
      time_spent_seconds: finished?.time_spent_seconds,
      estimated_minutes: finished?.estimated_minutes,
      categoryLabel: category ? TASK_CATEGORY_LABELS[category] : null,
    });
    if (eventId) {
      await sql`UPDATE todos SET calendar_event_id = ${eventId} WHERE id = ${id}`;
    }

    return recurring
      ? NextResponse.json({ success: true, recurring: true, next_due, calendar_event_id: eventId })
      : NextResponse.json({ success: true, recurring: false, calendar_event_id: eventId });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

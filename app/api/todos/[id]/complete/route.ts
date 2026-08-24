import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { logCompletedTaskToCalendar } from "@/lib/task-calendar";
import { TASK_CATEGORY_LABELS, normalizeCategory } from "@/lib/task-categories";

// Local date, not UTC — toISOString() would roll the day over in the evening here.
function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    // "Done & repeat" — cross the task off *and* line the same work up for tomorrow.
    // The plain check-off sends no body at all, so an unparseable body just means "no".
    const body = await req.json().catch(() => ({}));
    const repeatTomorrow = Boolean(body?.repeat);

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
      // A recurring task already comes back on its own — "repeat tomorrow" just pulls
      // that next occurrence forward instead of spawning a duplicate row.
      next_due = repeatTomorrow ? tomorrow() : nextDueDate(todo.recurrence);
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

    // A one-off task asked to repeat gets a fresh copy of itself dated tomorrow:
    // same title, priority, estimate, category, lane and card colour, but a clean
    // timer and no queue slot. The original stays completed so today's record —
    // and its calendar block — survives.
    let repeated = null;
    if (repeatTomorrow && !recurring) {
      const [source] = await sql`
        SELECT title, priority, estimated_minutes, category, parent_id, canvas_x, canvas_y, color
        FROM todos WHERE id = ${id}
      `;
      if (source) {
        [repeated] = await sql`
          INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes, category, parent_id, canvas_x, canvas_y, color)
          VALUES (${source.title}, ${source.priority}, ${tomorrow()}, 'none', ${source.estimated_minutes}, ${source.category}, ${source.parent_id}, ${source.canvas_x}, ${source.canvas_y}, ${source.color})
          RETURNING id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id, color
        `;
      }
    }

    return recurring
      ? NextResponse.json({ success: true, recurring: true, next_due, calendar_event_id: eventId })
      : NextResponse.json({ success: true, recurring: false, repeated, calendar_event_id: eventId });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

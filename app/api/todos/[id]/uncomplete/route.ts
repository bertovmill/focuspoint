import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { removeCompletedTaskFromCalendar } from "@/lib/task-calendar";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();

    const [todo] = await sql`SELECT recurrence, calendar_event_id FROM todos WHERE id = ${id}`;
    if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Un-doing a task takes its block back off the calendar.
    await removeCompletedTaskFromCalendar(todo.calendar_event_id);
    await sql`UPDATE todos SET calendar_event_id = NULL WHERE id = ${id}`;

    if (todo.recurrence && todo.recurrence !== "none") {
      const [row] = await sql`
        UPDATE todos
        SET due_date = CURRENT_DATE, completed_at = NULL
        WHERE id = ${id}
        RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
      `;
      return NextResponse.json(row);
    }

    const [row] = await sql`
      UPDATE todos
      SET completed = FALSE, completed_at = NULL
      WHERE id = ${id}
      RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

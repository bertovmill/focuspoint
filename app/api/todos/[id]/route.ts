import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hasWorkingSlot, workingLimitMessage } from "@/lib/working-now";
import { normalizeCategory } from "@/lib/task-categories";
import { normalizeCardColor } from "@/lib/task-colors";
import { removeCompletedTaskFromCalendar } from "@/lib/task-calendar";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    // Deleting the task takes its completed-block off the calendar too, so the
    // calendar never keeps a record of work whose task no longer exists.
    const [todo] = await sql`SELECT calendar_event_id FROM todos WHERE id = ${id}`;
    await removeCompletedTaskFromCalendar(todo?.calendar_event_id);
    await sql`DELETE FROM todos WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, priority, recurrence } = body;
    // in_progress and waiting are mutually exclusive: setting one clears the other.
    let { in_progress, waiting } = body;
    if (in_progress === true) waiting = false;
    else if (waiting === true) in_progress = false;
    // Only three things can be "working on now" at a time.
    const slot = in_progress === true ? await hasWorkingSlot(getDb(), id) : null;
    if (slot && !slot.allowed) {
      return NextResponse.json({ error: workingLimitMessage(slot.limit) }, { status: 409 });
    }
    const hasDueDate = Object.prototype.hasOwnProperty.call(body, "due_date");
    const due_date = hasDueDate ? body.due_date : undefined;
    // task_number is explicitly nullable (null clears it), so presence of the key
    // — not truthiness — decides whether we touch the column.
    const hasTaskNumber = Object.prototype.hasOwnProperty.call(body, "task_number");
    const rawTaskNumber = Number(body.task_number);
    const task_number =
      hasTaskNumber && body.task_number !== null && body.task_number !== "" && Number.isFinite(rawTaskNumber)
        ? Math.trunc(rawTaskNumber)
        : null;
    // estimated_minutes is explicitly nullable (null/"" clears it), so presence of the
    // key — not truthiness — decides whether we touch the column.
    const hasEstimatedMinutes = Object.prototype.hasOwnProperty.call(body, "estimated_minutes");
    const rawEstimatedMinutes = Number(body.estimated_minutes);
    const estimated_minutes =
      hasEstimatedMinutes && body.estimated_minutes !== null && body.estimated_minutes !== "" && Number.isFinite(rawEstimatedMinutes) && rawEstimatedMinutes > 0
        ? Math.trunc(rawEstimatedMinutes)
        : null;
    // category is explicitly nullable (null/"" clears it), so presence of the key
    // — not truthiness — decides whether we touch the column.
    const hasCategory = Object.prototype.hasOwnProperty.call(body, "category");
    const category = normalizeCategory(body.category);
    // Same nullable-by-presence rule for the card colour: sending color:null clears it
    // back to a plain card, omitting the key leaves whatever's there.
    const hasColor = Object.prototype.hasOwnProperty.call(body, "color");
    const color = normalizeCardColor(body.color);
    const sql = getDb();
    // Queue positions are slots: giving #3 to this task takes it from whoever had it.
    if (hasTaskNumber && task_number !== null) {
      await sql`
        UPDATE todos SET task_number = NULL
        WHERE task_number = ${task_number} AND completed = FALSE AND id <> ${id}
      `;
    }
    const [row] = hasDueDate
      ? await sql`
          UPDATE todos
          SET
            title = COALESCE(${title ?? null}, title),
            priority = COALESCE(${priority ?? null}, priority),
            due_date = ${due_date ?? null},
            recurrence = COALESCE(${recurrence ?? null}, recurrence),
            in_progress = COALESCE(${in_progress ?? null}, in_progress),
            waiting = COALESCE(${waiting ?? null}, waiting),
            task_number = CASE WHEN ${hasTaskNumber}::boolean THEN ${task_number}::int ELSE task_number END,
            estimated_minutes = CASE WHEN ${hasEstimatedMinutes}::boolean THEN ${estimated_minutes}::int ELSE estimated_minutes END,
            category = CASE WHEN ${hasCategory}::boolean THEN ${category}::text ELSE category END,
            color = CASE WHEN ${hasColor}::boolean THEN ${color}::text ELSE color END,
            -- Working on it again is the clearest statement that it belongs in the
            -- pinned window, so starting a task un-hides it.
            pinned_hidden_at = CASE WHEN ${in_progress === true}::boolean THEN NULL ELSE pinned_hidden_at END
          WHERE id = ${id}
          RETURNING id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id, color, pinned_hidden_at
        `
      : await sql`
          UPDATE todos
          SET
            title = COALESCE(${title ?? null}, title),
            priority = COALESCE(${priority ?? null}, priority),
            recurrence = COALESCE(${recurrence ?? null}, recurrence),
            in_progress = COALESCE(${in_progress ?? null}, in_progress),
            waiting = COALESCE(${waiting ?? null}, waiting),
            task_number = CASE WHEN ${hasTaskNumber}::boolean THEN ${task_number}::int ELSE task_number END,
            estimated_minutes = CASE WHEN ${hasEstimatedMinutes}::boolean THEN ${estimated_minutes}::int ELSE estimated_minutes END,
            category = CASE WHEN ${hasCategory}::boolean THEN ${category}::text ELSE category END,
            color = CASE WHEN ${hasColor}::boolean THEN ${color}::text ELSE color END,
            -- Working on it again is the clearest statement that it belongs in the
            -- pinned window, so starting a task un-hides it.
            pinned_hidden_at = CASE WHEN ${in_progress === true}::boolean THEN NULL ELSE pinned_hidden_at END
          WHERE id = ${id}
          RETURNING id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id, color, pinned_hidden_at
        `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

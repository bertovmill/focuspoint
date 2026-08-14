import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { buildDoneBlock } from "../../lib/done-block.js";
import { TASK_CATEGORY_LABELS, normalizeCategory } from "../../lib/task-categories.js";
import { createRawCalendarEvent, resolveGoogleToken } from "../lib/google-calendar.js";

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
}

// Plots the finished work onto Google Calendar so past weeks can be audited.
// Best-effort — a calendar problem must never make a completed task look failed.
async function logToCalendar(id: number, finished: Record<string, unknown> | undefined) {
  if (!finished) return;
  try {
    const token = await resolveGoogleToken();
    if (!token) return;
    const category = normalizeCategory(finished.category);
    const result = await createRawCalendarEvent(
      token,
      buildDoneBlock({
        title: String(finished.title ?? "Task"),
        time_spent_seconds: Number(finished.time_spent_seconds ?? 0),
        estimated_minutes: finished.estimated_minutes as number | null,
        categoryLabel: category ? TASK_CATEGORY_LABELS[category] : null,
      }),
    );
    if (result.success && result.eventId) {
      const sql = getDb();
      await sql`UPDATE todos SET calendar_event_id = ${result.eventId} WHERE id = ${id}`;
    }
  } catch {
    // not connected / network blip — the task is still done
  }
}

export default defineTool({
  description: "Mark a todo as completed. Recurring todos are rescheduled to their next occurrence instead of removed.",
  inputSchema: z.object({
    id: z.number().int().describe("The todo id to mark as done"),
  }),
  async execute({ id }) {
    const sql = getDb();
    const [todo] = await sql`SELECT id, title, recurrence FROM todos WHERE id = ${id}`;
    if (!todo) return { success: false, message: `Todo ${id} not found` };

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
    let next_due: string | undefined;
    if (recurring) {
      next_due = nextDueDate(todo.recurrence);
      await sql`UPDATE todos SET due_date = ${next_due}, completed_at = NOW(), in_progress = FALSE WHERE id = ${id}`;
    } else {
      await sql`UPDATE todos SET completed = TRUE, completed_at = NOW(), in_progress = FALSE WHERE id = ${id}`;
    }

    await logToCalendar(id, finished);
    return { success: true, title: todo.title, recurring, next_due };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed." };
    if (output.recurring) {
      return { type: "text" as const, value: `"${output.title}" done — rescheduled to ${output.next_due} (recurring).` };
    }
    return { type: "text" as const, value: `Marked "${output.title}" as done.` };
  },
});

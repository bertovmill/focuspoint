import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
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

    if (todo.recurrence && todo.recurrence !== "none") {
      const next_due = nextDueDate(todo.recurrence);
      await sql`UPDATE todos SET due_date = ${next_due}, completed_at = NOW() WHERE id = ${id}`;
      return { success: true, title: todo.title, recurring: true, next_due };
    }

    await sql`UPDATE todos SET completed = TRUE, completed_at = NOW() WHERE id = ${id}`;
    return { success: true, title: todo.title, recurring: false };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed." };
    if (output.recurring) {
      return { type: "text" as const, value: `"${output.title}" done — rescheduled to ${output.next_due} (recurring).` };
    }
    return { type: "text" as const, value: `Marked "${output.title}" as done.` };
  },
});

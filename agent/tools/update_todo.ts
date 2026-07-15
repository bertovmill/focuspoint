import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Edit an existing todo's title, priority, due date, recurrence, or in-progress status. Use list_todos first if you don't know its id.",
  inputSchema: z.object({
    id: z.number().int().describe("The todo id to edit"),
    title: z.string().min(1).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    due_date: z.string().optional().describe("ISO date string, e.g. '2026-06-30'"),
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
    in_progress: z
      .boolean()
      .optional()
      .describe("True when the user is actively working on this task now (highlights it in the UI); false to clear"),
  }),
  async execute({ id, ...patch }) {
    const sql = getDb();
    const [row] = await sql`
      UPDATE todos
      SET
        title = COALESCE(${patch.title ?? null}, title),
        priority = COALESCE(${patch.priority ?? null}, priority),
        due_date = COALESCE(${patch.due_date ?? null}, due_date),
        recurrence = COALESCE(${patch.recurrence ?? null}, recurrence),
        in_progress = COALESCE(${patch.in_progress ?? null}, in_progress)
      WHERE id = ${id}
      RETURNING id, title, priority, due_date, recurrence, in_progress
    `;
    if (!row) return { success: false as const, message: `Todo ${id} not found` };
    return { success: true as const, id: Number(row.id), title: String(row.title) };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message };
    return { type: "text" as const, value: `Updated todo "${output.title}" (id: ${output.id}).` };
  },
});

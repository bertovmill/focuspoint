import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { hasWorkingSlot, WORKING_LIMIT, WORKING_LIMIT_MESSAGE } from "../../lib/working-now.js";
import { TASK_CATEGORIES } from "../../lib/task-categories.js";

export default defineTool({
  description:
    "Edit an existing todo's title, priority, due date, recurrence, category, in-progress, or waiting status. Use list_todos first if you don't know its id.",
  inputSchema: z.object({
    id: z.number().int().describe("The todo id to edit"),
    title: z.string().min(1).optional(),
    priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
    due_date: z.string().optional().describe("ISO date string, e.g. '2026-06-30'"),
    recurrence: z.enum(["none", "daily", "weekly", "monthly"]).optional(),
    in_progress: z
      .boolean()
      .optional()
      .describe(
        `True when the user is actively working on this task now (moves it into the "Working on now" section at the top of the UI); false to clear. At most ${WORKING_LIMIT} tasks can be working-on-now at once — clear one first if it's full.`,
      ),
    waiting: z
      .boolean()
      .optional()
      .describe("True when the task is blocked waiting on someone or something (amber badge in the UI); false to clear"),
    category: z
      .enum(TASK_CATEGORIES)
      .nullable()
      .optional()
      .describe(
        "Kind of work: 'events', 'calls', 'ai_agents', or 'content'. Pass null to clear it — most tasks are none of these.",
      ),
  }),
  async execute({ id, ...patch }) {
    // in_progress and waiting are mutually exclusive: setting one clears the other.
    if (patch.in_progress === true) patch.waiting = false;
    else if (patch.waiting === true) patch.in_progress = false;
    // Only WORKING_LIMIT things can be "working on now" at a time.
    if (patch.in_progress === true && !(await hasWorkingSlot(getDb(), id))) {
      return { success: false as const, message: WORKING_LIMIT_MESSAGE };
    }
    // category is explicitly clearable (null), so presence of the key — not
    // truthiness — decides whether we touch the column.
    const hasCategory = patch.category !== undefined;
    const sql = getDb();
    const [row] = await sql`
      UPDATE todos
      SET
        title = COALESCE(${patch.title ?? null}, title),
        priority = COALESCE(${patch.priority ?? null}, priority),
        due_date = COALESCE(${patch.due_date ?? null}, due_date),
        recurrence = COALESCE(${patch.recurrence ?? null}, recurrence),
        in_progress = COALESCE(${patch.in_progress ?? null}, in_progress),
        waiting = COALESCE(${patch.waiting ?? null}, waiting),
        category = CASE WHEN ${hasCategory}::boolean THEN ${patch.category ?? null}::text ELSE category END
      WHERE id = ${id}
      RETURNING id, title, priority, due_date, recurrence, in_progress, waiting, category
    `;
    if (!row) return { success: false as const, message: `Todo ${id} not found` };
    return { success: true as const, id: Number(row.id), title: String(row.title) };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message };
    return { type: "text" as const, value: `Updated todo "${output.title}" (id: ${output.id}).` };
  },
});

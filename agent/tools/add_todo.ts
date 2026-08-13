import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { TASK_CATEGORIES } from "../../lib/task-categories.js";

export default defineTool({
  description: "Add a new todo task for the user.",
  inputSchema: z.object({
    title: z.string().describe("What needs to be done"),
    priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
    due_date: z.string().optional().describe("ISO date string, e.g. '2026-06-30'"),
    recurrence: z
      .enum(["none", "daily", "weekly", "monthly"])
      .default("none")
      .describe("How often this task repeats. 'none' means one-time."),
    estimated_minutes: z
      .number()
      .int()
      .positive()
      .describe("Required. Estimated time to complete this task, in minutes."),
    category: z
      .enum(TASK_CATEGORIES)
      .optional()
      .describe(
        "Optional kind of work: 'events' (an event he's running or attending), 'calls' (a call/meeting with someone), or 'ai_agents' (building or wiring up AI agents). Leave it off for anything else — most tasks are none of these.",
      ),
  }),
  async execute({ title, priority, due_date, recurrence, estimated_minutes, category }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes, category)
      VALUES (${title}, ${priority}, ${due_date ?? null}, ${recurrence}, ${estimated_minutes}, ${category ?? null})
      RETURNING id, title, priority, due_date, recurrence, estimated_minutes, category, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    const rec = output.recurrence && output.recurrence !== "none" ? ` (repeats ${output.recurrence})` : "";
    return { type: "text", value: `Todo added: "${output.title}"${rec} (id: ${output.id})` };
  },
});

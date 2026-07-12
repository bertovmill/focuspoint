import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

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
  }),
  async execute({ title, priority, due_date, recurrence }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date, recurrence)
      VALUES (${title}, ${priority}, ${due_date ?? null}, ${recurrence})
      RETURNING id, title, priority, due_date, recurrence, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    const rec = output.recurrence && output.recurrence !== "none" ? ` (repeats ${output.recurrence})` : "";
    return { type: "text", value: `Todo added: "${output.title}"${rec} (id: ${output.id})` };
  },
});

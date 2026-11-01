import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "Add a new todo task for the user.",
  inputSchema: z.object({
    title: z.string().describe("What needs to be done"),
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    due_date: z.string().optional().describe("ISO date string, e.g. '2026-06-30'"),
  }),
  async execute({ title, priority, due_date }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date)
      VALUES (${title}, ${priority}, ${due_date ?? null})
      RETURNING id, title, priority, due_date, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Todo added: "${output.title}" (id: ${output.id})` };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "Mark a todo as completed.",
  inputSchema: z.object({
    id: z.number().int().describe("The todo id to mark as done"),
  }),
  async execute({ id }) {
    const sql = getDb();
    const [row] = await sql`
      UPDATE todos
      SET completed = TRUE, completed_at = NOW()
      WHERE id = ${id}
      RETURNING id, title
    `;
    if (!row) return { success: false, message: `Todo ${id} not found` };
    return { success: true, title: row.title };
  },
  toModelOutput(output) {
    return {
      type: "text" as const,
      value: output.success ? `Marked "${output.title}" as done.` : (output.message ?? "Failed."),
    };
  },
});

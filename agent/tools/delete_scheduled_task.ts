import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "Permanently delete a scheduled task. Confirm with the user before calling this — it can't be undone.",
  inputSchema: z.object({ id: z.number().int() }),
  async execute({ id }) {
    const sql = getDb();
    const rows = await sql`DELETE FROM scheduled_tasks WHERE id = ${id} RETURNING title`;
    return { deleted: rows.length > 0, title: rows[0] ? String(rows[0].title) : null };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: output.deleted ? `Deleted scheduled task "${output.title}".` : "No scheduled task found with that id.",
    };
  },
});

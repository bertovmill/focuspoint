import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";

export default defineTool({
  description: "List the user's todos. Use this when the user asks what they need to do, or before planning their day.",
  inputSchema: z.object({
    include_completed: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ include_completed, limit }) {
    const sql = getDb();
    const rows = include_completed
      ? await sql`
          SELECT * FROM todos
          ORDER BY completed ASC,
            CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 ELSE 0 END DESC,
            created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT * FROM todos WHERE completed = FALSE
          ORDER BY
            CASE priority WHEN 'urgent' THEN 3 WHEN 'high' THEN 2 WHEN 'normal' THEN 1 ELSE 0 END DESC,
            created_at DESC
          LIMIT ${limit}
        `;
    // Timestamp columns come back as Date objects, which eve rejects as non-JSON —
    // flatten them to ISO strings (same as list_notes).
    const todos = rows.map((r) =>
      Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v instanceof Date ? v.toISOString() : v])),
    );
    return { todos, count: todos.length };
  },
});

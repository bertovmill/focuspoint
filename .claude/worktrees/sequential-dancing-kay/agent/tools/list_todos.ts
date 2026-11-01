import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "List the user's todos. Use this when the user asks what they need to do, or before planning their day.",
  inputSchema: z.object({
    include_completed: z.boolean().default(false),
    limit: z.number().int().min(1).max(50).default(20),
  }),
  async execute({ include_completed, limit }) {
    const sql = getDb();
    const rows = include_completed
      ? await sql`SELECT * FROM todos ORDER BY completed ASC, priority DESC, created_at DESC LIMIT ${limit}`
      : await sql`SELECT * FROM todos WHERE completed = FALSE ORDER BY priority DESC, created_at DESC LIMIT ${limit}`;
    return { todos: rows, count: rows.length };
  },
});

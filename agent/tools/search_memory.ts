import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Search past thoughts and notes the user has captured. Use this to recall context about the user before answering questions about them, their goals, or their history.",
  inputSchema: z.object({
    query: z.string().describe("Keywords or topic to search for"),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ query, limit }) {
    const sql = getDb();
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const rows = await sql`
      SELECT id, content, tags, created_at
      FROM thoughts
      WHERE content ILIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const results = rows.map((r) => ({
      id: Number(r.id),
      content: String(r.content),
      tags: Array.isArray(r.tags) ? r.tags : [],
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
    return { results, count: results.length };
  },
});

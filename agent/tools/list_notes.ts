import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List the user's notes (captured thoughts). Use this when the user asks to see their notes, memories, or thoughts — especially to reflect on patterns, review what they've captured, or find something specific by tag.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(50).default(20).describe("How many notes to return"),
    tag: z.string().optional().describe("Filter notes by a specific tag, e.g. 'goals' or 'values'"),
  }),
  async execute({ limit, tag }) {
    const sql = getDb();
    const rows = tag
      ? await sql`
          SELECT id, content, tags, created_at
          FROM thoughts
          WHERE ${tag} = ANY(tags)
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, content, tags, created_at
          FROM thoughts
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    const notes = rows.map((r) => ({
      id: Number(r.id),
      content: String(r.content),
      tags: Array.isArray(r.tags) ? r.tags : [],
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
    return { notes, count: notes.length };
  },
  toModelOutput(output) {
    if (output.count === 0) return { type: "text", value: "No notes found." };
    const lines = output.notes.map(
      (n) => `• ${n.content}${n.tags.length ? ` [${n.tags.join(", ")}]` : ""}`,
    );
    return { type: "text", value: `${output.count} note${output.count !== 1 ? "s" : ""}:\n${lines.join("\n")}` };
  },
});

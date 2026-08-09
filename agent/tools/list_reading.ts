import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "List the user's logged reading history (finished books, page counts, dates). Use this to answer questions about reading pace or what's been read recently.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(200).default(60),
  }),
  async execute({ limit }) {
    const sql = getDb();
    const rows = await sql`
      SELECT book_title, pages, logged_date, is_estimate
      FROM reading_logs
      ORDER BY logged_date DESC
      LIMIT ${limit}
    `;
    return { logs: rows };
  },
  toModelOutput(output) {
    if (output.logs.length === 0) return { type: "text", value: "No books logged yet." };
    const value = output.logs
      .filter((l) => !l.is_estimate)
      .map((l) => `${l.logged_date}: "${l.book_title}" — ${l.pages} pages`)
      .join("\n");
    return { type: "text", value: value || "Only estimated pre-tracking books on record so far — no individually logged books yet." };
  },
});

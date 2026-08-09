import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Log a book the user just finished reading. Look up the book's page count with web_search first (search '<title> page count'), then call this with that number — don't ask the user for it. Powers the Reading chart on the Home dashboard.",
  inputSchema: z.object({
    book_title: z.string().min(1),
    pages: z.number().int().positive(),
    date: z.string().optional().describe("ISO date string, e.g. '2026-08-09'. Defaults to today."),
  }),
  async execute({ book_title, pages, date }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO reading_logs (book_title, pages, logged_date)
      VALUES (${book_title}, ${pages}, ${date ?? new Date().toISOString().slice(0, 10)})
      RETURNING book_title, pages, logged_date
    `;
    return row;
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Logged "${output.book_title}" — ${output.pages} pages, finished ${output.logged_date}.`,
    };
  },
});

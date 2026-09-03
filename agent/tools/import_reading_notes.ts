import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { parseClippings } from "../../lib/kindle-clippings.js";
import { incrementNotesWritten } from "../../lib/scorecard.js";

export default defineTool({
  description:
    "Import Kindle notes from a pasted 'My Clippings.txt' file. Pass the raw text the user pastes in chat " +
    "(they'll copy it off their Kindle over USB). Only new notes get inserted — re-pasting the whole file " +
    "after adding a few more notes is safe. Highlights are skipped; only 'Your Note' entries count.",
  inputSchema: z.object({
    clippings_text: z.string().min(1).describe("The raw contents of My Clippings.txt"),
  }),
  async execute({ clippings_text }) {
    const sql = getDb();
    const clippings = parseClippings(clippings_text);
    if (clippings.length === 0) return { imported: 0, total_parsed: 0 };

    const insertedDates: string[] = [];
    for (const c of clippings) {
      const rows = await sql`
        INSERT INTO reading_notes (book_title, note, location, note_date)
        VALUES (${c.bookTitle}, ${c.note}, ${c.location}, ${c.date}::date)
        ON CONFLICT (book_title, note, note_date) DO NOTHING
        RETURNING to_char(note_date, 'YYYY-MM-DD') AS date
      `;
      if (rows[0]) insertedDates.push(String(rows[0].date));
    }

    const byDate = new Map<string, number>();
    for (const date of insertedDates) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    for (const [date, count] of byDate) await incrementNotesWritten(sql, date, count);

    return { imported: insertedDates.length, total_parsed: clippings.length };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value:
        output.imported === 0
          ? `Parsed ${output.total_parsed} note(s) — all already logged, nothing new.`
          : `Imported ${output.imported} new note(s) out of ${output.total_parsed} parsed.`,
    };
  },
});

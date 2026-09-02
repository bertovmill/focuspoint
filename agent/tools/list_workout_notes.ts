import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

/** The driver hands DATE columns back as a JS Date; format it locally rather than
 *  via toISOString(), which shifts the day in any timezone west of UTC. */
function toISODate(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

export default defineTool({
  description:
    "Read back the user's plain-text training notes — what workout they did each day and what they accomplished. Use this to answer questions about what their training has actually looked like ('what have I been doing on push days?', 'when did I last run?', 'how did squats feel last week?'), and always call it before log_workout_note when adding to a day that may already have a note, so the existing text can be preserved.",
  inputSchema: z.object({
    date: z.string().optional().describe("ISO date string to fetch one specific day, e.g. '2026-09-01'."),
    limit: z.number().int().min(1).max(200).default(30).describe("How many recent days to return when no date is given."),
  }),
  async execute({ date, limit }) {
    const sql = getDb();
    try {
      const rows = date
        ? await sql`
            SELECT logged_date, note FROM workout_notes
            WHERE logged_date = ${date}
          `
        : await sql`
            SELECT logged_date, note FROM workout_notes
            WHERE note <> ''
            ORDER BY logged_date DESC
            LIMIT ${limit}
          `;
      return { notes: rows.map((r) => ({ logged_date: toISODate(r.logged_date), note: r.note as string })) };
    } catch {
      // Includes "relation workout_notes does not exist" before the first note.
      return { notes: [] };
    }
  },
  toModelOutput(output) {
    if (output.notes.length === 0) return { type: "text", value: "No training notes logged yet." };
    return {
      type: "text",
      value: output.notes.map((n) => `${n.logged_date}: ${n.note}`).join("\n\n"),
    };
  },
});

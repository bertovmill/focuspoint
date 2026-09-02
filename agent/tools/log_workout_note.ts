import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb, ensureSchema } from "../../lib/db.js";

export default defineTool({
  description:
    "Write the plain-text training note for a day: what workout the user did and what they accomplished (e.g. 'Push day — bench 5x5 @185, added 10lb, first three unbroken sets of dips, 45 min'). This is the free-text training log that appears on the Home dashboard, separate from log_workout which stores the six numeric lifts. There is exactly one note per day: writing a day again REPLACES its note, so when the user adds to a workout they already logged today, first read the existing note with list_workout_notes and send back the combined text rather than overwriting what is there.",
  inputSchema: z.object({
    note: z
      .string()
      .describe(
        "The day's training note in plain text, in the user's own words. Include what was trained, key numbers, and anything accomplished or noteworthy (PRs, how it felt, injuries).",
      ),
    date: z.string().optional().describe("ISO date string, e.g. '2026-09-01'. Defaults to today."),
  }),
  async execute({ note, date }) {
    const sql = getDb();
    const loggedDate = date ?? new Date().toISOString().slice(0, 10);
    const upsert = () => sql`
      INSERT INTO workout_notes (logged_date, note)
      VALUES (${loggedDate}, ${note})
      ON CONFLICT (logged_date)
      DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()
      RETURNING logged_date, note
    `;
    let row;
    try {
      [row] = await upsert();
    } catch {
      await ensureSchema();
      [row] = await upsert();
    }
    return { logged_date: loggedDate, note: row.note };
  },
  toModelOutput(output) {
    return { type: "text", value: `Saved the training note for ${output.logged_date}: ${output.note}` };
  },
});

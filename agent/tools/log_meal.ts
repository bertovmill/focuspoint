import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Log a meal the user ate onto the Nutrition screen. Use this whenever they mention something they ate — especially when it left them with good energy, since this log is the record of meals worth repeating. Set felt_good to false only if they say it made them feel sluggish or foggy.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Short name of the meal, e.g. 'Beans, brown rice and avocado'"),
    notes: z.string().optional().describe("How it made them feel, or anything worth remembering about it"),
    felt_good: z.boolean().optional().describe("Defaults to true"),
    date: z.string().optional().describe("ISO date string, e.g. '2026-08-22'. Defaults to today."),
  }),
  async execute({ name, notes, felt_good, date }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_meals (name, notes, felt_good, eaten_date)
      VALUES (
        ${name},
        ${notes ?? null},
        ${felt_good ?? true},
        ${date ?? new Date().toISOString().slice(0, 10)}
      )
      RETURNING id, name, felt_good, eaten_date
    `;
    return row;
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Logged "${output.name}" on ${String(output.eaten_date).slice(0, 10)}${output.felt_good ? "" : " (felt off)"}.`,
    };
  },
});

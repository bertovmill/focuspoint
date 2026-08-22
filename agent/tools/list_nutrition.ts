import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { isOnProtocol } from "../../lib/nutrition.js";

export default defineTool({
  description:
    "Read the user's nutrition record: recently logged meals, how many of the last N days were fully on protocol, and the standing shelf of energy staples. Use before suggesting what to eat or shop for, so suggestions build on foods that already work for them.",
  inputSchema: z.object({
    days: z.number().int().positive().max(180).optional().describe("How far back to look. Defaults to 30."),
  }),
  async execute({ days }) {
    const window = days ?? 30;
    const sql = getDb();
    const meals = await sql`
      SELECT name, notes, felt_good, eaten_date
      FROM nutrition_meals
      WHERE eaten_date >= CURRENT_DATE - ${window}::int
      ORDER BY eaten_date DESC, created_at DESC
      LIMIT 60
    `;
    const dayRows = await sql`
      SELECT logged_date, rules FROM nutrition_days
      WHERE logged_date >= CURRENT_DATE - ${window}::int
      ORDER BY logged_date DESC
    `;
    const staples = await sql`SELECT name, why FROM nutrition_staples ORDER BY sort_order ASC, created_at ASC`;
    const onProtocol = dayRows.filter((d) => isOnProtocol(d.rules as string[])).length;
    return {
      window,
      meals: meals.map((m) => ({ ...m, eaten_date: String(m.eaten_date).slice(0, 10) })),
      days_logged: dayRows.length,
      days_on_protocol: onProtocol,
      staples,
    };
  },
  toModelOutput(output) {
    const meals = output.meals as { name: string; eaten_date: string; felt_good: boolean }[];
    const staples = output.staples as { name: string; why: string | null }[];
    const lines = [
      `Last ${output.window} days: ${output.days_on_protocol}/${output.days_logged} logged days fully on protocol.`,
      "",
      meals.length ? `Meals (${meals.length}):` : "No meals logged.",
      ...meals.map((m) => `- ${m.eaten_date} ${m.name}${m.felt_good ? "" : " (felt off)"}`),
      "",
      `Staples: ${staples.map((s) => s.name).join(", ") || "none"}`,
    ];
    return { type: "text", value: lines.join("\n") };
  },
});

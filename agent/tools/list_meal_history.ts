import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List recent meal recommendations — three a day (lunch, snack, dinner) — along with the user's thumbs up/down feedback on each. Call this before changing a sitting with `set_daily_meal` so the choice reflects what he has liked and disliked recently.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(60).default(21).describe("How many recent recommendations to return (three per day)"),
  }),
  async execute({ limit }) {
    const sql = getDb();
    const rows = await sql`
      SELECT meal_date, slot, name, description, cuisine, feedback
      FROM meal_recommendations
      ORDER BY meal_date DESC, CASE slot WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END
      LIMIT ${limit}
    `;
    return { meals: rows };
  },
  toModelOutput(output) {
    if (output.meals.length === 0) {
      return { type: "text", value: "No meal recommendations yet." };
    }
    const value = output.meals
      .map((m) => {
        const feedback = m.feedback ? ` — ${m.feedback === "up" ? "liked" : "disliked"}` : "";
        return `${m.meal_date} ${m.slot ?? "meal"}: ${m.name} (${m.cuisine})${feedback}`;
      })
      .join("\n");
    return { type: "text", value };
  },
});

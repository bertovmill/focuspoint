import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List recent daily meal recommendations along with the user's thumbs up/down feedback on each. Call this before picking today's meal with `set_daily_meal` so the choice reflects what the user has liked and disliked recently.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(30).default(14).describe("How many recent days to return"),
  }),
  async execute({ limit }) {
    const sql = getDb();
    const rows = await sql`
      SELECT meal_date, name, description, cuisine, feedback
      FROM meal_recommendations
      ORDER BY meal_date DESC
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
        return `${m.meal_date}: ${m.name} (${m.cuisine})${feedback}`;
      })
      .join("\n");
    return { type: "text", value };
  },
});

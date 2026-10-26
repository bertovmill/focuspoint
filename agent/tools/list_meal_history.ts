import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";
import { jsonSafe } from "../../lib/json-safe";
import { getTasteProfile } from "../../lib/meal-feedback";

export default defineTool({
  description:
    "Read what Berto thinks of his meals: his taste profile (the Loves / Avoid / Notes page on /meals, rewritten from his ratings), his 👍/👎 ratings on meal-bank meals with his one-line reasons, and recent planned meals — up to three a day (meal1–meal3) plus an optional snack; days before 2026-10-04 used lunch/snack/dinner. Call this before suggesting a meal or changing a sitting with `set_daily_meal`: favour 👍 meals and what the profile loves, and never suggest a 👎 meal or anything the profile says to avoid.",
  inputSchema: z.object({
    limit: z.number().int().min(1).max(60).default(21).describe("How many recent planned meals to return (three per day)"),
  }),
  async execute({ limit }) {
    const sql = getDb();
    const [rows, ratings, profile] = await Promise.all([
      sql`
        SELECT meal_date, slot, name, cuisine
        FROM meal_recommendations
        ORDER BY meal_date DESC, CASE slot WHEN 'meal1' THEN 1 WHEN 'meal2' THEN 2 WHEN 'meal3' THEN 3 WHEN 'snack' THEN 4 ELSE 5 END
        LIMIT ${limit}
      `,
      sql`
        SELECT DISTINCT ON (f.recipe_id) r.name, f.rating, f.reason, f.created_at
        FROM meal_feedback f JOIN nutrition_recipes r ON r.id = f.recipe_id
        WHERE r.archived_at IS NULL
        ORDER BY f.recipe_id, f.created_at DESC, f.id DESC
      `,
      getTasteProfile(),
    ]);
    return { taste_profile: profile.content.trim(), ratings: jsonSafe(ratings), meals: jsonSafe(rows) };
  },
  toModelOutput(output) {
    const ratings = output.ratings
      .map((r) => `- ${r.rating === "up" ? "👍" : "👎"} ${r.name}${r.reason ? ` — "${r.reason}"` : ""}`)
      .join("\n");
    const meals = output.meals.map((m) => `- ${m.meal_date} ${m.slot ?? "meal"}: ${m.name}`).join("\n");
    const value = [
      `Taste profile:\n${output.taste_profile || "(not written yet)"}`,
      `Ratings on bank meals:\n${ratings || "(none yet)"}`,
      `Recent planned meals:\n${meals || "(none yet)"}`,
    ].join("\n\n");
    return { type: "text", value };
  },
});

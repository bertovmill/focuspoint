import { generateObject } from "ai";
import { z } from "zod";

import { getDb } from "./db";
import { generateMealImage } from "./nutrition-art";
import { MEAL_SLOTS, NUTRITION_TAGS, type MealSlot } from "./nutrition";

const TEXT_MODEL = "anthropic/claude-sonnet-4.6";

const MealIdea = z.object({
  name: z.string().describe("Short dish name"),
  description: z.string().describe("One or two sentences: what it is and why it fits today"),
  cuisine: z.string(),
  image_prompt: z.string().describe("Vivid visual description of the plated dish for a photograph"),
});

export interface SuggestedMeal {
  id: number;
  meal_date: string;
  slot: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
}

/**
 * Everything the model needs to suggest food Berto will actually eat: the shelf
 * of staples he keeps, the principles he's written down, and what he's eaten
 * lately (so it doesn't hand him the same dinner three days running).
 */
async function gatherContext() {
  const sql = getDb();
  const [staples, principles, recent, feedback] = await Promise.all([
    sql`SELECT name, why FROM nutrition_staples ORDER BY sort_order ASC`,
    sql`
      SELECT content FROM thoughts
      WHERE tags && ${[...NUTRITION_TAGS]}::text[]
      ORDER BY created_at DESC LIMIT 25
    `,
    sql`
      SELECT name, slot, eaten_date, felt_good FROM nutrition_meals
      WHERE eaten_date >= CURRENT_DATE - 10 ORDER BY eaten_date DESC LIMIT 30
    `,
    sql`
      SELECT name, slot, feedback FROM meal_recommendations
      WHERE feedback IS NOT NULL AND meal_date >= CURRENT_DATE - 30
      ORDER BY meal_date DESC LIMIT 20
    `,
  ]);
  return [
    "STAPLES HE KEEPS (build from these first):",
    ...staples.map((s) => `- ${s.name}${s.why ? ` — ${s.why}` : ""}`),
    "",
    "HIS OWN FOOD PRINCIPLES (these are rules, not suggestions):",
    ...principles.map((p) => `- ${String(p.content).replace(/\s+/g, " ").slice(0, 300)}`),
    "",
    recent.length ? "EATEN IN THE LAST 10 DAYS (don't repeat these):" : "Nothing logged recently.",
    ...recent.map((r) => `- ${String(r.eaten_date).slice(0, 10)} ${r.slot ?? ""} ${r.name}${r.felt_good ? "" : " (felt off)"}`),
    ...(feedback.length
      ? ["", "PAST FEEDBACK ON RECOMMENDATIONS:", ...feedback.map((f) => `- ${f.slot}: ${f.name} → ${f.feedback}`)]
      : []),
  ].join("\n");
}

/**
 * Suggests one sitting and saves it (photo included) as today's recommendation
 * for that slot, replacing whatever was there. Shared by the daily schedule, the
 * re-roll button on the Nutrition screen, and the agent tool.
 */
export async function suggestMeal(slot: MealSlot, date?: string): Promise<SuggestedMeal> {
  const meta = MEAL_SLOTS.find((s) => s.key === slot);
  if (!meta) throw new Error(`Unknown meal slot: ${slot}`);
  const context = await gatherContext();

  const { object } = await generateObject({
    model: TEXT_MODEL,
    schema: MealIdea,
    prompt: [
      "You plan food for Berto, who eats one lunch, one snack and one dinner a day and treats food as fuel for",
      "mental performance. Suggest his " + meta.label.toUpperCase() + " for today.",
      "",
      `WHAT THIS SITTING IS: ${meta.guidance}`,
      "",
      "Whole-food vegetarian by default: no dairy, no added sugar. Keep it simple enough to actually make.",
      "",
      context,
    ].join("\n"),
  });

  const image_url = await generateMealImage(object.image_prompt, slot);
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO meal_recommendations (meal_date, slot, name, description, cuisine, image_url)
    VALUES (
      ${date ?? new Date().toISOString().slice(0, 10)},
      ${slot},
      ${object.name},
      ${object.description},
      ${object.cuisine},
      ${image_url}
    )
    ON CONFLICT (meal_date, slot) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      cuisine = EXCLUDED.cuisine,
      image_url = EXCLUDED.image_url,
      feedback = NULL,
      feedback_at = NULL
    RETURNING id, meal_date, slot, name, description, cuisine, image_url
  `;
  return row as unknown as SuggestedMeal;
}

/**
 * Fills in whatever the day is missing. Called from the daily schedule tick, so
 * one slot failing (a model hiccup, a blob timeout) must not lose the others.
 */
export async function ensureTodaysMeals(date?: string) {
  const day = date ?? new Date().toISOString().slice(0, 10);
  const sql = getDb();
  const existing = await sql`SELECT slot FROM meal_recommendations WHERE meal_date = ${day}`;
  const have = new Set(existing.map((r) => String(r.slot)));
  const filled: string[] = [];
  const failed: string[] = [];
  for (const { key } of MEAL_SLOTS) {
    if (have.has(key)) continue;
    try {
      await suggestMeal(key, day);
      filled.push(key);
    } catch (err) {
      console.warn(`[meals] ${key} failed:`, err);
      failed.push(key);
    }
  }
  return { date: day, filled, failed, already: [...have] };
}

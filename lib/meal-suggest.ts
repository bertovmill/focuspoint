import { generateObject } from "ai";
import { z } from "zod";

import { getDb } from "./db";
import { buildMealPrompt } from "./meal-prompt";
import { generateMealImage } from "./nutrition-art";
import { MEAL_SLOTS, normalizeIngredients, type MealSlot } from "./nutrition";
import type { PlannedMeal } from "./nutrition-plan";

export const TEXT_MODEL = "deepseek/deepseek-v4-flash";

export const MealIdea = z.object({
  name: z.string().describe("Short dish name"),
  description: z.string().describe("One or two sentences: what it is and why it fits today"),
  cuisine: z.string(),
  protein_g: z.number().describe("Estimated grams of protein in one serving, as eaten"),
  kcal: z.number().int().describe("Estimated calories in one serving"),
  ingredients: z
    .array(z.string())
    .describe("Shopping-list ingredients for one serving, one per entry with a rough amount, e.g. 'Lentils (1 cup dry)'"),
  image_prompt: z.string().describe("Vivid visual description of the plated dish for a photograph"),
});

export type SuggestedMeal = PlannedMeal;

export interface SuggestOptions {
  /** Generate and upload a photo. Today's cards want one; a week of future cells doesn't. */
  withImage?: boolean;
}

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Suggests one sitting and saves it as the plan for that slot on that date,
 * replacing whatever was there. Shared by the daily schedule, the buttons on the
 * Nutrition screens, and the agent tool.
 */
export async function suggestMeal(slot: MealSlot, date?: string, opts: SuggestOptions = {}): Promise<PlannedMeal> {
  const day = date ?? localToday();
  const withImage = opts.withImage ?? day === localToday();
  const prompt = await buildMealPrompt(slot, day);

  const { object } = await generateObject({
    model: TEXT_MODEL,
    schema: MealIdea,
    prompt,
  });

  const image_url = withImage ? await generateMealImage(object.image_prompt, slot) : null;
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO meal_recommendations (meal_date, slot, name, description, cuisine, image_url, protein_g, kcal, ingredients, recipe_id)
    VALUES (
      ${day},
      ${slot},
      ${object.name},
      ${object.description},
      ${object.cuisine},
      ${image_url},
      ${Math.round(object.protein_g)},
      ${Math.round(object.kcal)},
      ${normalizeIngredients(object.ingredients)},
      NULL
    )
    ON CONFLICT (meal_date, slot) DO UPDATE SET
      name = EXCLUDED.name,
      description = EXCLUDED.description,
      cuisine = EXCLUDED.cuisine,
      image_url = EXCLUDED.image_url,
      protein_g = EXCLUDED.protein_g,
      kcal = EXCLUDED.kcal,
      ingredients = EXCLUDED.ingredients,
      recipe_id = NULL,
      feedback = NULL,
      feedback_at = NULL
    RETURNING id, to_char(meal_date, 'YYYY-MM-DD') AS meal_date, slot, name, description, cuisine, image_url, feedback, protein_g, kcal, ingredients, recipe_id
  `;
  return {
    ...(row as unknown as PlannedMeal),
    meal_date: String(row.meal_date),
    protein_g: row.protein_g === null ? null : Number(row.protein_g),
    kcal: row.kcal === null ? null : Number(row.kcal),
  };
}

/**
 * Fills in whatever the day is missing. Called from the daily schedule tick, so
 * one slot failing (a model hiccup, a blob timeout) must not lose the others.
 */
export async function ensureTodaysMeals(date?: string, opts: SuggestOptions = {}) {
  const day = date ?? localToday();
  const sql = getDb();
  const existing = await sql`SELECT slot FROM meal_recommendations WHERE meal_date = ${day}`;
  const have = new Set(existing.map((r) => String(r.slot)));
  const filled: string[] = [];
  const failed: string[] = [];
  for (const { key } of MEAL_SLOTS) {
    if (have.has(key)) continue;
    try {
      await suggestMeal(key, day, opts);
      filled.push(key);
    } catch (err) {
      console.warn(`[meals] ${key} failed:`, err);
      failed.push(key);
    }
  }
  return { date: day, filled, failed, already: [...have] };
}

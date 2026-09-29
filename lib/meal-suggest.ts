import { generateObject } from "ai";
import { z } from "zod";

import { getDb } from "./db";
import { generateMealImage } from "./nutrition-art";
import { MEAL_SLOTS, NUTRITION_TAGS, normalizeIngredients, type MealSlot } from "./nutrition";
import { getMealNotes } from "./meal-notes";
import { getProteinTarget, type PlannedMeal } from "./nutrition-plan";

const TEXT_MODEL = "anthropic/claude-sonnet-4.6";

const MealIdea = z.object({
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

/**
 * Everything the model needs to suggest food Berto will actually eat: the shelf
 * of staples he keeps, the principles he's written down, his Notes page on
 * /meals (usual grocery list, go-to meals), the recipes he's saved, his protein
 * target, and what he's eaten lately (so it doesn't hand him the same dinner
 * three days running).
 */
async function gatherContext(date: string) {
  const sql = getDb();
  const [staples, principles, notes, recent, feedback, recipes, sameDay, target] = await Promise.all([
    sql`SELECT name, why FROM nutrition_staples ORDER BY sort_order ASC`,
    sql`
      SELECT content FROM thoughts
      WHERE tags && ${[...NUTRITION_TAGS]}::text[]
      ORDER BY created_at DESC LIMIT 25
    `,
    getMealNotes().then((d) => d.content.trim()),
    sql`
      SELECT name, slot, eaten_date, felt_good FROM nutrition_meals
      WHERE eaten_date >= CURRENT_DATE - 10 ORDER BY eaten_date DESC LIMIT 30
    `,
    sql`
      SELECT name, slot, feedback FROM meal_recommendations
      WHERE feedback IS NOT NULL AND meal_date >= CURRENT_DATE - 30
      ORDER BY meal_date DESC LIMIT 20
    `,
    sql`SELECT name, slot, protein_g FROM nutrition_recipes ORDER BY created_at DESC LIMIT 30`,
    sql`SELECT slot, name, protein_g FROM meal_recommendations WHERE meal_date = ${date}`,
    getProteinTarget(),
  ]);
  const planned = sameDay.reduce((sum, r) => sum + (Number(r.protein_g) || 0), 0);
  return [
    `PROTEIN TARGET: about ${target} g over the day across lunch, snack and dinner. Dinner carries the most.`,
    sameDay.length
      ? `ALREADY PLANNED THAT DAY (${planned} g so far): ${sameDay.map((r) => `${r.slot}: ${r.name} (${r.protein_g ?? "?"} g)`).join("; ")}`
      : "Nothing else planned for that day yet.",
    "",
    "STAPLES HE KEEPS (build from these first):",
    ...staples.map((s) => `- ${s.name}${s.why ? ` — ${s.why}` : ""}`),
    "",
    "HIS OWN FOOD PRINCIPLES (these are rules, not suggestions):",
    ...principles.map((p) => `- ${String(p.content).replace(/\s+/g, " ").slice(0, 300)}`),
    "",
    ...(notes
      ? ["HIS MEAL NOTES (usual grocery list, go-to meals — lean on what he already buys):", notes.slice(0, 3000), ""]
      : []),
    ...(recipes.length
      ? [
          "RECIPES HE HAS SAVED (favour variations on these; don't repeat one planned that week):",
          ...recipes.map((r) => `- ${r.name}${r.slot ? ` (${r.slot})` : ""}${r.protein_g ? ` — ${r.protein_g} g protein` : ""}`),
          "",
        ]
      : []),
    recent.length ? "EATEN IN THE LAST 10 DAYS (don't repeat these):" : "Nothing logged recently.",
    ...recent.map((r) => `- ${String(r.eaten_date).slice(0, 10)} ${r.slot ?? ""} ${r.name}${r.felt_good ? "" : " (felt off)"}`),
    ...(feedback.length
      ? ["", "PAST FEEDBACK ON RECOMMENDATIONS:", ...feedback.map((f) => `- ${f.slot}: ${f.name} → ${f.feedback}`)]
      : []),
  ].join("\n");
}

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
  const meta = MEAL_SLOTS.find((s) => s.key === slot);
  if (!meta) throw new Error(`Unknown meal slot: ${slot}`);
  const day = date ?? localToday();
  const withImage = opts.withImage ?? day === localToday();
  const context = await gatherContext(day);

  const { object } = await generateObject({
    model: TEXT_MODEL,
    schema: MealIdea,
    prompt: [
      "You plan food for Berto, who eats one lunch, one snack and one dinner a day and treats food as fuel for",
      `mental performance and training. Suggest his ${meta.label.toUpperCase()} for ${day}.`,
      "",
      `WHAT THIS SITTING IS: ${meta.guidance}`,
      "",
      "Whole-food vegetarian by default: no dairy, no added sugar. Keep it simple enough to actually make.",
      "Give honest protein and calorie estimates for the serving described, and a real shopping list.",
      "",
      context,
    ].join("\n"),
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

import { generateText, Output } from "ai";
import { z } from "zod";
import { getDb } from "./db";
import { normalizeIngredients, PROTOCOL_RULES } from "./nutrition";
import { getMealRatings, shapeRecipe, type MealRating, type MealRatingEntry, type Recipe } from "./nutrition-plan";
import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "./settings-doc";

// 👍/👎 + a one-liner on a bank meal (2026-10-25). Three things follow from it:
//  1. the rotation (fillFromBank) drops 👎 meals and favours 👍 ones;
//  2. the taste profile — a short markdown doc on /meals#meal-taste-profile —
//     is rewritten by a model from every rating and reason;
//  3. a 👎 meal gets one new meal written for its sitting, following the
//     Robbins rules and the taste profile, so the bank doesn't shrink.
// 2 and 3 run after the response (next/server `after`), so tapping stays instant.

const MODEL = "anthropic/claude-sonnet-4.6";
const TASTE_PROFILE_KEY = "meals.taste_profile.markdown";
// The last version the model wrote, so the next rewrite can tell its own lines
// (dropped when the ratings stop backing them) from ones he typed in (kept).
const TASTE_PROFILE_GENERATED_KEY = "meals.taste_profile.generated";

const SITTING_RULE: Record<string, string> = {
  meal1: "Morning (Meal 1): fruit only, eaten alone on an empty stomach. No other food at all.",
  meal2: "Midday (Meal 2): water-rich and green-led; animal protein OR starch with vegetables, never both.",
  meal3: "Evening (Meal 3): water-rich and green-led; animal protein OR starch with vegetables, never both.",
  snack: "Snack: light and water-rich.",
};

const RULES = PROTOCOL_RULES.map((r) => `- ${r.label}: ${r.detail}`).join("\n");

export function getTasteProfile(): Promise<SettingsDoc> {
  return getSettingsDoc(TASTE_PROFILE_KEY);
}

export function setTasteProfile(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(TASTE_PROFILE_KEY, content);
}

export async function getMealRating(recipeId: number): Promise<MealRatingEntry | null> {
  return (await getMealRatings([recipeId])).get(recipeId) ?? null;
}

/**
 * Saves his rating. The same rating again only updates the reason on the
 * latest row (the one-liner usually arrives a moment after the tap); a change
 * adds a row, so the history stays. `null` takes the rating off.
 */
export async function rateMeal(recipeId: number, rating: MealRating | null, reason: string | null) {
  const sql = getDb();
  const why = reason?.trim().slice(0, 280) || null;
  if (rating === null) {
    await sql`DELETE FROM meal_feedback WHERE recipe_id = ${recipeId}`;
    return null;
  }
  const [latest] = await sql`
    SELECT id, rating FROM meal_feedback WHERE recipe_id = ${recipeId} ORDER BY created_at DESC, id DESC LIMIT 1
  `;
  if (latest && latest.rating === rating) {
    await sql`UPDATE meal_feedback SET reason = ${why}, updated_at = NOW() WHERE id = ${latest.id}`;
  } else {
    await sql`INSERT INTO meal_feedback (recipe_id, rating, reason) VALUES (${recipeId}, ${rating}, ${why})`;
  }
  return { rating, reason: why };
}

/** The follow-up work for a rating, run after the response has gone. Errors are logged, never thrown. */
export async function afterRating(recipeId: number) {
  await Promise.all([
    refreshTasteProfile().catch((e) => console.error("[meal-feedback] taste profile", e)),
    replaceIfDisliked(recipeId).catch((e) => console.error("[meal-feedback] replacement", e)),
  ]);
}

async function feedbackStamp(): Promise<string> {
  const sql = getDb();
  const [row] = await sql`SELECT COALESCE(MAX(updated_at), 'epoch')::text AS at, COUNT(*)::int AS n FROM meal_feedback`;
  return `${row.at}:${row.n}`;
}

const lines = (doc: string) =>
  doc
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Rewrites the taste profile from every rated meal. The model writes from the
 * ratings alone; lines he typed in himself (anything in the profile that isn't
 * in the model's last version) are handed back to keep, so taking a rating off
 * drops what the model drew from it but never his own words. Two quick taps
 * start two rewrites; whichever started before the latest change doesn't save,
 * so the newest ratings always win.
 */
export async function refreshTasteProfile(): Promise<SettingsDoc | null> {
  const sql = getDb();
  const stamp = await feedbackStamp();
  const rows = await sql`
    SELECT DISTINCT ON (f.recipe_id) f.rating, f.reason, r.name, r.slot, r.ingredients
    FROM meal_feedback f JOIN nutrition_recipes r ON r.id = f.recipe_id
    ORDER BY f.recipe_id, f.created_at DESC, f.id DESC
  `;
  const generated = new Set(lines((await getSettingsDoc(TASTE_PROFILE_GENERATED_KEY)).content));
  const his = lines((await getTasteProfile()).content).filter((l) => !l.startsWith("#") && !generated.has(l));

  let text = his.length ? `## Notes\n${his.join("\n")}` : "";
  if (rows.length > 0) {
    const ratings = rows
      .map((r) => {
        const thumb = r.rating === "up" ? "LIKED" : "DISLIKED";
        const why = r.reason ? ` — "${r.reason}"` : "";
        const ings = Array.isArray(r.ingredients) && r.ingredients.length ? ` [${r.ingredients.join(", ")}]` : "";
        return `- ${thumb}: ${r.name} (${r.slot ?? "any sitting"})${ings}${why}`;
      })
      .join("\n");
    ({ text } = await generateText({
      model: MODEL,
      system: `You keep Berto's meal taste profile: a short markdown note that guides which meals get written into his meal bank. He eats by Tony Robbins' rules:
${RULES}

Write the profile from his ratings and one-line reasons. Format:
## Loves
## Avoid
## Notes
Short, concrete bullets (ingredients, flavours, textures, how much effort he'll put in). Generalise only as far as the ratings and reasons support, and quote no more than a few words of a reason. Never contradict the Robbins rules. Under 180 words. No preamble, no closing line.

He may have written some lines himself. Keep each one word for word, under whichever heading fits it best.`,
      prompt: `His own lines:\n${his.join("\n") || "(none)"}\n\nHis ratings (latest per meal):\n${ratings}`,
      temperature: 0.3,
      maxOutputTokens: 800,
    }));
  }

  if ((await feedbackStamp()) !== stamp) return null;
  const mine = new Set(his);
  await setSettingsDoc(TASTE_PROFILE_GENERATED_KEY, lines(text).filter((l) => !mine.has(l)).join("\n"));
  return setTasteProfile(text.trim());
}

const NewMeal = z.object({
  name: z.string().describe("Short, appetising title, NYT Cooking style"),
  description: z.string().describe("One sentence that makes him want to cook it"),
  ingredients: z.array(z.string()).describe("Plain ingredient names for the grocery list, e.g. 'Cucumber'"),
  lines: z.array(z.string()).describe("Ingredient lines with amounts, for one serving"),
  steps: z.array(z.string()).describe("3–6 method steps, each a sentence or two"),
  minutes: z.number().int().describe("Rough total time"),
});

/**
 * Writes one new bank meal for the sitting of a meal he 👎'd, unless that meal
 * already has one (nutrition_recipes.replaces_id), so re-rating never piles
 * up meals. The new meal's photo is made the first time it shows on Home.
 */
export async function replaceIfDisliked(recipeId: number): Promise<Recipe | null> {
  const sql = getDb();
  const rating = await getMealRating(recipeId);
  if (rating?.rating !== "down") return null;
  const [done] = await sql`SELECT 1 FROM nutrition_recipes WHERE replaces_id = ${recipeId} LIMIT 1`;
  if (done) return null;
  const [row] = await sql`SELECT * FROM nutrition_recipes WHERE id = ${recipeId}`;
  if (!row) return null;
  const disliked = shapeRecipe(row as Record<string, unknown>);
  const slot = disliked.slot ?? "meal2";

  const bank = await sql`SELECT name FROM nutrition_recipes WHERE archived_at IS NULL`;
  const profile = (await getTasteProfile()).content.trim();

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: NewMeal }),
    system: `You write one new meal for Berto's meal bank. Every meal follows Tony Robbins' rules:
${RULES}

This one is for: ${SITTING_RULE[slot] ?? SITTING_RULE.meal2}
Make it something he'll be excited to cook, using whole, easy-to-find ingredients. Follow his taste profile.`,
    prompt: `He disliked "${disliked.name}" (${disliked.ingredients.join(", ") || "no ingredients listed"})${
      rating.reason ? ` and said: "${rating.reason}"` : ""
    }. Write a different meal for the same sitting that fixes that.

His taste profile:
${profile || "(not written yet)"}

Already in the bank (don't repeat or lightly rename these):
${bank.map((b) => `- ${b.name}`).join("\n")}`,
    temperature: 0.8,
    maxOutputTokens: 1500,
  });

  // Checked again: a second rating could have written one while the model ran.
  const [raced] = await sql`SELECT 1 FROM nutrition_recipes WHERE replaces_id = ${recipeId} LIMIT 1`;
  if (raced) return null;
  const [created] = await sql`
    INSERT INTO nutrition_recipes (name, description, slot, ingredients, minutes, ingredient_lines, steps, replaces_id)
    VALUES (
      ${output.name.trim()}, ${output.description.trim()}, ${slot}, ${normalizeIngredients(output.ingredients)},
      ${output.minutes}, ${output.lines}, ${output.steps}, ${recipeId}
    )
    RETURNING *
  `;
  return shapeRecipe(created as Record<string, unknown>);
}

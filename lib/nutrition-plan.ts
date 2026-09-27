// Server-side helpers for the week plan on /meals. The grid's cells are
// rows in meal_recommendations (one per date and slot — the same rows the
// morning tick fills for today), the library is nutrition_recipes, and the
// protein target is one app_settings key.
import { getDb } from "./db";
import {
  DEFAULT_PROTEIN_TARGET_G,
  MEAL_SLOT_KEYS,
  PROTEIN_TARGET_SETTING_KEY,
  normalizeIngredients,
  num,
} from "./nutrition";

export interface PlannedMeal {
  id: number;
  meal_date: string;
  slot: string;
  name: string;
  description: string | null;
  cuisine: string | null;
  image_url: string | null;
  feedback: "up" | "down" | null;
  protein_g: number | null;
  kcal: number | null;
  ingredients: string[];
  recipe_id: number | null;
}

export interface Recipe {
  id: number;
  name: string;
  description: string | null;
  slot: string | null;
  protein_g: number | null;
  kcal: number | null;
  ingredients: string[];
  image_url: string | null;
  created_at: string;
}

// meal_date is formatted in SQL: the driver would otherwise hand back a Date
// object (or a UTC-midnight timestamp), and the grid keys cells by the ISO day.
const PLAN_COLUMNS = `id, to_char(meal_date, 'YYYY-MM-DD') AS meal_date, slot, name, description, cuisine, image_url, feedback,
  protein_g, kcal, ingredients, recipe_id`;

function shapePlan(row: Record<string, unknown>): PlannedMeal {
  return {
    id: Number(row.id),
    meal_date: String(row.meal_date),
    slot: String(row.slot),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    cuisine: (row.cuisine as string | null) ?? null,
    image_url: (row.image_url as string | null) ?? null,
    feedback: (row.feedback as "up" | "down" | null) ?? null,
    protein_g: num(row.protein_g),
    kcal: num(row.kcal),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(String) : [],
    recipe_id: num(row.recipe_id),
  };
}

export function shapeRecipe(row: Record<string, unknown>): Recipe {
  return {
    id: Number(row.id),
    name: String(row.name),
    description: (row.description as string | null) ?? null,
    slot: (row.slot as string | null) ?? null,
    protein_g: num(row.protein_g),
    kcal: num(row.kcal),
    ingredients: Array.isArray(row.ingredients) ? row.ingredients.map(String) : [],
    image_url: (row.image_url as string | null) ?? null,
    created_at: String(row.created_at),
  };
}

export async function getPlanRange(from: string, to: string): Promise<PlannedMeal[]> {
  const sql = getDb();
  const rows = await sql.query(
    `SELECT ${PLAN_COLUMNS} FROM meal_recommendations
     WHERE meal_date BETWEEN $1 AND $2
     ORDER BY meal_date ASC, CASE slot WHEN 'lunch' THEN 1 WHEN 'snack' THEN 2 ELSE 3 END`,
    [from, to],
  );
  return (rows as Record<string, unknown>[]).map(shapePlan);
}

export interface SetPlannedMealInput {
  date: string;
  slot: string;
  name: string;
  description?: string | null;
  cuisine?: string | null;
  protein_g?: number | null;
  kcal?: number | null;
  ingredients?: unknown;
  recipe_id?: number | null;
  image_url?: string | null;
}

/**
 * Writes one cell by hand — from the picker, a typed-in meal, or Cael when he's
 * given the numbers. Replaces whatever was there and clears its feedback, like
 * the suggester does. Pass `recipe_id` to copy a library entry's fields.
 */
export async function setPlannedMeal(input: SetPlannedMealInput): Promise<PlannedMeal> {
  if (!MEAL_SLOT_KEYS.includes(input.slot)) throw new Error(`Unknown meal slot: ${input.slot}`);
  const sql = getDb();
  let { name, description, protein_g, kcal, image_url } = input;
  let ingredients = normalizeIngredients(input.ingredients);
  if (input.recipe_id) {
    const [r] = await sql`SELECT * FROM nutrition_recipes WHERE id = ${input.recipe_id}`;
    if (!r) throw new Error("Recipe not found");
    const recipe = shapeRecipe(r as Record<string, unknown>);
    name = name?.trim() || recipe.name;
    description = description ?? recipe.description;
    protein_g = protein_g ?? recipe.protein_g;
    kcal = kcal ?? recipe.kcal;
    image_url = image_url ?? recipe.image_url;
    if (ingredients.length === 0) ingredients = recipe.ingredients;
  }
  if (!name?.trim()) throw new Error("name required");
  const [row] = await sql.query(
    `INSERT INTO meal_recommendations
       (meal_date, slot, name, description, cuisine, image_url, protein_g, kcal, ingredients, recipe_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (meal_date, slot) DO UPDATE SET
       name = EXCLUDED.name,
       description = EXCLUDED.description,
       cuisine = EXCLUDED.cuisine,
       image_url = EXCLUDED.image_url,
       protein_g = EXCLUDED.protein_g,
       kcal = EXCLUDED.kcal,
       ingredients = EXCLUDED.ingredients,
       recipe_id = EXCLUDED.recipe_id,
       feedback = NULL,
       feedback_at = NULL
     RETURNING ${PLAN_COLUMNS}`,
    [
      input.date,
      input.slot,
      name.trim(),
      description ?? null,
      input.cuisine ?? null,
      image_url ?? null,
      protein_g ?? null,
      kcal ?? null,
      ingredients,
      input.recipe_id ?? null,
    ],
  );
  return shapePlan(row as Record<string, unknown>);
}

export async function clearPlannedMeal(date: string, slot: string) {
  const sql = getDb();
  await sql`DELETE FROM meal_recommendations WHERE meal_date = ${date} AND slot = ${slot}`;
}

// ── Protein target ────────────────────────────────────────────────────────

export async function getProteinTarget(): Promise<number> {
  const sql = getDb();
  const [row] = await sql`SELECT value FROM app_settings WHERE key = ${PROTEIN_TARGET_SETTING_KEY}`;
  const n = num(row?.value);
  return n && n > 0 ? n : DEFAULT_PROTEIN_TARGET_G;
}

export async function setProteinTarget(grams: number) {
  if (!Number.isFinite(grams) || grams <= 0 || grams > 500) throw new Error("Target must be between 1 and 500 g");
  const sql = getDb();
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${PROTEIN_TARGET_SETTING_KEY}, ${String(Math.round(grams))}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return Math.round(grams);
}

/** Grams of protein logged as eaten on `date` (only meals that carry a number). */
export async function proteinEatenOn(date: string): Promise<number> {
  const sql = getDb();
  const [row] = await sql`
    SELECT COALESCE(SUM(protein_g), 0) AS total FROM nutrition_meals WHERE eaten_date = ${date}
  `;
  return num(row?.total) ?? 0;
}

// ── Groceries ─────────────────────────────────────────────────────────────

export const GROCERY_LIST_NAME = "Groceries";

/**
 * Pushes every ingredient in the plan between `from` and `to` onto the
 * Groceries list in Lists — the same one-way bridge the staples shelf uses.
 * Skips anything already open on the list, so re-running is safe. Creates the
 * list if it isn't there yet.
 */
export async function addPlanToGroceries(from: string, to: string) {
  const sql = getDb();
  const plan = await getPlanRange(from, to);
  const wanted = normalizeIngredients(plan.flatMap((p) => p.ingredients));
  if (wanted.length === 0) return { added: [] as string[], skipped: 0, listId: null as number | null };

  let [list] = await sql`SELECT id FROM lists WHERE name = ${GROCERY_LIST_NAME} LIMIT 1`;
  if (!list) {
    [list] = await sql`INSERT INTO lists (name) VALUES (${GROCERY_LIST_NAME}) RETURNING id`;
  }
  const listId = Number(list.id);
  const open = await sql`SELECT title FROM list_items WHERE list_id = ${listId} AND completed = FALSE`;
  const have = new Set(open.map((r) => String(r.title).trim().toLowerCase()));

  const added: string[] = [];
  let skipped = 0;
  for (const item of wanted) {
    if (have.has(item.toLowerCase())) {
      skipped++;
      continue;
    }
    await sql`INSERT INTO list_items (list_id, title) VALUES (${listId}, ${item})`;
    added.push(item);
  }
  return { added, skipped, listId };
}

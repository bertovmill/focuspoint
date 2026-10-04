// Server-side helpers for the week plan on /meals. The grid's cells are
// rows in meal_recommendations (one per date and slot — the same rows the
// morning tick fills for today), the library is nutrition_recipes, and the
// protein target is one app_settings key.
import { getDb } from "./db";
import {
  DEFAULT_PROTEIN_TARGET_G,
  addDaysISO,
  MEAL_SLOT_KEYS,
  SLOT_ORDER_SQL,
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
     ORDER BY meal_date ASC, ${SLOT_ORDER_SQL}`,
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

// ── filling from the bank ─────────────────────────────────────────────
// Berto rarely strays from his meal bank, so every planned sitting comes from
// nutrition_recipes — no model calls. Bank meals aren't tied to a sitting. The
// rotation reaches the whole bank: each cell takes the meal planned least often
// over the last three weeks that isn't already on that day, ties at random.

export interface BankFillResult {
  filled: PlannedMeal[];
  /** Cells left alone: already planned, or nothing in the bank for that sitting. */
  skipped: number;
}

export async function fillFromBank(
  targets: { date: string; slot: string }[],
  { overwrite = false }: { overwrite?: boolean } = {},
): Promise<BankFillResult> {
  const cells = targets.filter((t) => MEAL_SLOT_KEYS.includes(t.slot)).sort((a, b) => a.date.localeCompare(b.date));
  if (cells.length === 0) return { filled: [], skipped: targets.length };
  const sql = getDb();
  const recipes = (await sql`SELECT * FROM nutrition_recipes`).map((r) => shapeRecipe(r as Record<string, unknown>));
  if (recipes.length === 0) throw new Error("The meal bank is empty — add a few meals first.");

  const from = addDaysISO(cells[0].date, -21);
  const to = addDaysISO(cells[cells.length - 1].date, 7);
  const planned = await sql`
    SELECT recipe_id, to_char(meal_date, 'YYYY-MM-DD') AS meal_date, slot FROM meal_recommendations
    WHERE meal_date BETWEEN ${from} AND ${to}
  `;
  const uses = new Map<number, number>();
  const current = new Map<string, number | null>();
  for (const p of planned) {
    const id = num(p.recipe_id);
    current.set(`${p.meal_date}:${p.slot}`, id);
    if (id) uses.set(id, (uses.get(id) ?? 0) + 1);
  }

  const filled: PlannedMeal[] = [];
  let skipped = 0;
  for (const c of cells) {
    const k = `${c.date}:${c.slot}`;
    if (!overwrite && current.has(k)) {
      skipped++;
      continue;
    }
    // Any bank meal fits any sitting — but not one already on that day.
    const sameDay = new Set(
      [...current.entries()].filter(([ck, id]) => ck.startsWith(`${c.date}:`) && ck !== k && id).map(([, id]) => id),
    );
    let pool = recipes.filter((r) => !sameDay.has(r.id));
    if (pool.length === 0) pool = recipes;
    // A swap should land on something different when there's anything else.
    const was = current.get(k);
    if (was && pool.length > 1) pool = pool.filter((r) => r.id !== was);
    if (pool.length === 0) {
      skipped++;
      continue;
    }
    const least = Math.min(...pool.map((r) => uses.get(r.id) ?? 0));
    const choices = pool.filter((r) => (uses.get(r.id) ?? 0) === least);
    const pick = choices[Math.floor(Math.random() * choices.length)];
    filled.push(await setPlannedMeal({ date: c.date, slot: c.slot, name: "", recipe_id: pick.id }));
    uses.set(pick.id, least + 1);
    current.set(k, pick.id);
  }
  return { filled, skipped };
}

/** Finds a bank entry by name: exact (any case) first, then a partial match. */
export async function findRecipeByName(name: string): Promise<Recipe | null> {
  const sql = getDb();
  const needle = name.trim();
  if (!needle) return null;
  const [exact] = await sql`SELECT * FROM nutrition_recipes WHERE lower(name) = lower(${needle}) LIMIT 1`;
  if (exact) return shapeRecipe(exact as Record<string, unknown>);
  const [partial] = await sql`
    SELECT * FROM nutrition_recipes WHERE name ILIKE ${"%" + needle + "%"} ORDER BY length(name) ASC LIMIT 1
  `;
  return partial ? shapeRecipe(partial as Record<string, unknown>) : null;
}

export async function listRecipes(): Promise<Recipe[]> {
  const sql = getDb();
  const rows = await sql`SELECT * FROM nutrition_recipes ORDER BY name ASC`;
  return rows.map((r) => shapeRecipe(r as Record<string, unknown>));
}

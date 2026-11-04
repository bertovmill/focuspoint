import { generateText } from "ai";
import { getDb } from "@/lib/db";
import { addDaysISO, todayISO } from "@/lib/nutrition";
import { getProteinTarget } from "@/lib/nutrition-plan";

// "What did you eat yesterday?" — the first-open-of-day check-in on Home
// (Berto's ask, 2026-11-04). He answers in plain words ("fish with rice and
// some salad"), taps a few quick chips, flags sweets, and Cael turns that into
// rough meals in nutrition_meals for yesterday with ballpark protein/kcal.
// The point is a general read ("did I eat well?"), never calorie accounting.
//
// The chips are NOT a fixed list: they are the meals he has actually logged
// most often lately, so they drift with how he really eats. The seed below
// only fills gaps until there is history.

export const SEED_CHIPS = [
  "Smoothie",
  "Eggs, bacon and bread",
  "Oatmeal with fruit, nuts and seeds",
  "Salad mix",
  "Fish with rice and salad",
  "Takeout",
] as const;

export const CHIP_COUNT = 6;
export const CHECKIN_NOTE = "yesterday check-in";

/** Rough daily calorie band that counts as "ate well" for a 160g-protein day. */
export const KCAL_GOOD_MIN = 1700;
export const KCAL_GOOD_MAX = 2700;

export function yesterdayISO() {
  return addDaysISO(todayISO(), -1);
}

export interface EstimatedMeal {
  name: string;
  protein_g: number;
  kcal: number;
}

export type Verdict = "good" | "ok" | "off";

export interface CheckinResult {
  date: string;
  meals: EstimatedMeal[];
  totals: { protein_g: number; kcal: number };
  target_g: number;
  sweets: boolean;
  verdict: Verdict;
  note: string;
}

/** The six quick picks: his most-logged meal names from the last 90 days, seed-filled. */
export async function getChips(): Promise<string[]> {
  const sql = getDb();
  const rows = await sql`
    SELECT name, COUNT(*)::int AS n, MAX(eaten_date) AS last
    FROM nutrition_meals
    WHERE eaten_date >= CURRENT_DATE - 90
    GROUP BY name
    ORDER BY n DESC, last DESC
    LIMIT ${CHIP_COUNT * 2}
  `;
  const seen = new Set<string>();
  const out: string[] = [];
  const push = (name: string) => {
    const key = name.trim().toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    out.push(name.trim());
  };
  for (const r of rows) push(String(r.name));
  for (const s of SEED_CHIPS) {
    if (out.length >= CHIP_COUNT) break;
    push(s);
  }
  return out.slice(0, CHIP_COUNT);
}

export async function hasLoggedOn(date: string): Promise<boolean> {
  const [row] = await getDb()`SELECT 1 FROM nutrition_meals WHERE eaten_date = ${date} LIMIT 1`;
  return Boolean(row);
}

/** Last 7 logged days: average kcal + protein, and how many days were logged. */
export async function weekSummary(endISO: string) {
  const start = addDaysISO(endISO, -6);
  const rows = await getDb()`
    SELECT to_char(eaten_date, 'YYYY-MM-DD') AS d,
           COALESCE(SUM(protein_g), 0)::float AS protein_g,
           COALESCE(SUM(kcal), 0)::int AS kcal
    FROM nutrition_meals
    WHERE eaten_date BETWEEN ${start} AND ${endISO}
    GROUP BY eaten_date
    ORDER BY eaten_date
  `;
  const days = rows.map((r) => ({ date: String(r.d), protein_g: Number(r.protein_g), kcal: Number(r.kcal) }));
  const n = days.length || 1;
  return {
    days,
    logged: days.length,
    avg_protein_g: Math.round(days.reduce((a, d) => a + d.protein_g, 0) / n),
    avg_kcal: Math.round(days.reduce((a, d) => a + d.kcal, 0) / n),
  };
}

const ESTIMATE_MODEL = "anthropic/claude-haiku-4.5";

const ESTIMATE_PROMPT = `You turn a short plain-English description of what someone ate in a day into a rough meal list with ballpark macros.
Rules:
- Split into separate meals/items as the text implies (one entry per dish or snack, 1-6 entries).
- Estimate protein in grams and calories per entry for a typical adult-male portion. Round protein to 5g, calories to 50.
- Sweets, if mentioned, are their own entry.
- Keep names short, title-less, like "Fish with rice and salad".
- Respond with ONLY a JSON object: {"meals":[{"name":string,"protein_g":number,"kcal":number}]}. No prose.`;

function fallbackEstimate(text: string): EstimatedMeal[] {
  return text
    .split(/[,;\n]|\band\b|\bthen\b/i)
    .map((s) => s.trim())
    .filter((s) => s.length > 1)
    .slice(0, 6)
    .map((name) => ({ name: name.charAt(0).toUpperCase() + name.slice(1), protein_g: 25, kcal: 450 }));
}

export async function estimateMeals(text: string): Promise<EstimatedMeal[]> {
  try {
    const { text: raw } = await generateText({
      model: ESTIMATE_MODEL,
      system: ESTIMATE_PROMPT,
      prompt: text,
      temperature: 0.2,
      maxOutputTokens: 500,
    });
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = JSON.parse(json) as { meals?: unknown };
    const meals = Array.isArray(parsed.meals) ? parsed.meals : [];
    const clean = meals
      .map((m) => {
        const r = m as Record<string, unknown>;
        const name = String(r.name ?? "").trim();
        const protein = Number(r.protein_g);
        const kcal = Number(r.kcal);
        if (!name || !Number.isFinite(protein) || !Number.isFinite(kcal)) return null;
        return { name, protein_g: Math.max(0, Math.round(protein)), kcal: Math.max(0, Math.round(kcal)) };
      })
      .filter((m): m is EstimatedMeal => m !== null);
    if (clean.length) return clean;
  } catch {
    // fall through to the dumb split below
  }
  return fallbackEstimate(text);
}

export function judge(totals: { protein_g: number; kcal: number }, target_g: number, sweets: boolean): { verdict: Verdict; note: string } {
  const proteinOk = totals.protein_g >= target_g * 0.8;
  const kcalOk = totals.kcal >= KCAL_GOOD_MIN && totals.kcal <= KCAL_GOOD_MAX;
  const parts: string[] = [];
  if (!proteinOk) parts.push(`protein light (${Math.round(totals.protein_g)}g of ${target_g}g)`);
  if (totals.kcal > KCAL_GOOD_MAX) parts.push("calories ran high");
  if (totals.kcal < KCAL_GOOD_MIN) parts.push("calories ran low");
  if (sweets) parts.push("sweets snuck in");
  const misses = parts.length;
  if (proteinOk && kcalOk && !sweets) return { verdict: "good", note: "Solid day. Protein on target, calories in range, no sweets." };
  if (misses <= 1 && (proteinOk || kcalOk)) return { verdict: "ok", note: `Decent day, but ${parts.join(", ")}.` };
  return { verdict: "off", note: `Off day: ${parts.join(", ")}.` };
}

/** Estimate, store for yesterday, and judge. Replaces any earlier check-in rows for that date. */
export async function saveCheckin(text: string, sweets: boolean, date = yesterdayISO()): Promise<CheckinResult> {
  const sql = getDb();
  const described = sweets && !/sweet|dessert|chocolate|cookie|cake|candy|ice cream/i.test(text) ? `${text}. Also some sweets.` : text;
  const [meals, target_g] = await Promise.all([estimateMeals(described), getProteinTarget()]);
  // Re-answering the same day shouldn't double-count: drop the previous check-in rows only.
  await sql`DELETE FROM nutrition_meals WHERE eaten_date = ${date} AND notes = ${CHECKIN_NOTE}`;
  for (const m of meals) {
    await sql`
      INSERT INTO nutrition_meals (name, notes, felt_good, eaten_date, protein_g, kcal)
      VALUES (${m.name}, ${CHECKIN_NOTE}, TRUE, ${date}, ${m.protein_g}, ${m.kcal})
    `;
  }
  const totals = meals.reduce((a, m) => ({ protein_g: a.protein_g + m.protein_g, kcal: a.kcal + m.kcal }), { protein_g: 0, kcal: 0 });
  const { verdict, note } = judge(totals, target_g, sweets);
  return { date, meals, totals, target_g, sweets, verdict, note };
}

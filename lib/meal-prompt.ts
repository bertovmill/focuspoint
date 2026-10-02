import { getDb } from "./db";
import { getMealNotes } from "./meal-notes";
import { MEAL_SLOTS, NUTRITION_TAGS, type MealSlot } from "./nutrition";
import { getProteinTarget } from "./nutrition-plan";
import { getSettingsDoc, setSettingsDoc } from "./settings-doc";

// The prompt behind every meal suggestion, editable on /meals#meal-prompt.
// Berto owns the whole wording: one template with {{placeholders}} for the
// live data, plus a guidance line per sitting. Placeholders render data only
// (no headings), so the headings and instructions around them are his to
// rewrite, reorder or delete. Stored as JSON under one app_settings key;
// nothing saved means the defaults below.
const PROMPT_KEY = "meals.prompt.config";

export const DEFAULT_MEAL_PROMPT_TEMPLATE = `You plan food for Berto, who eats one lunch, one snack and one dinner a day and treats food as fuel for mental performance and training. Suggest his {{slot}} for {{date}}.

WHAT THIS SITTING IS: {{guidance}}

Keep it simple enough to actually make. Give honest protein and calorie estimates for the serving described, and a real shopping list.

HIS MEAL NOTES — his current rules. Anything under a Principles heading is a hard rule that overrides everything else here; the Staples are what he actually buys, so build from them first:
{{notes}}

PROTEIN TARGET: about {{protein_target}} g over the day across lunch, snack and dinner. Dinner carries the most.
ALREADY PLANNED THAT DAY: {{planned_today}}

OTHER STAPLES ON FILE:
{{staples}}

OLDER FOOD THOUGHTS HE'S CAPTURED (background — where they conflict with his Notes, the Notes win):
{{food_thoughts}}

RECIPES HE HAS SAVED (favour variations on these; don't repeat one planned that week):
{{recipes}}

EATEN IN THE LAST 10 DAYS (don't repeat these):
{{recent_meals}}

PAST FEEDBACK ON RECOMMENDATIONS:
{{feedback}}`;

export const DEFAULT_MEAL_GUIDANCE = Object.fromEntries(MEAL_SLOTS.map((s) => [s.key, s.guidance])) as Record<MealSlot, string>;

/** What each placeholder fills in with — shown next to the editor. */
export const MEAL_PROMPT_VARIABLES = [
  { name: "slot", description: "The sitting being planned, e.g. LUNCH" },
  { name: "date", description: "The day being planned, YYYY-MM-DD" },
  { name: "guidance", description: "That sitting's guidance line (edited below the template)" },
  { name: "notes", description: "Your Notes page on /meals (first 3,000 characters)" },
  { name: "protein_target", description: "Daily protein target in grams" },
  { name: "planned_today", description: "What's already planned that day, with protein" },
  { name: "staples", description: "Staples on file (nutrition_staples), one per line" },
  { name: "food_thoughts", description: "Last 25 thoughts tagged nutrition/energy/…" },
  { name: "recipes", description: "Last 30 saved recipes" },
  { name: "recent_meals", description: "Meals logged in the last 10 days" },
  { name: "feedback", description: "Thumbs up/down on suggestions, last 30 days" },
] as const;

export interface MealPromptConfig {
  template: string;
  guidance: Record<MealSlot, string>;
  updated_at: string | null;
  /** True when nothing is saved and the defaults are in force. */
  is_default: boolean;
}

export async function getMealPromptConfig(): Promise<MealPromptConfig> {
  const doc = await getSettingsDoc(PROMPT_KEY);
  let saved: { template?: unknown; guidance?: Record<string, unknown> } = {};
  try {
    saved = doc.content ? JSON.parse(doc.content) : {};
  } catch {
    // a mangled row falls back to the defaults rather than breaking suggestions
  }
  const template = typeof saved.template === "string" && saved.template.trim() ? saved.template : DEFAULT_MEAL_PROMPT_TEMPLATE;
  const guidance = { ...DEFAULT_MEAL_GUIDANCE };
  for (const { key } of MEAL_SLOTS) {
    const g = saved.guidance?.[key];
    if (typeof g === "string") guidance[key] = g;
  }
  return { template, guidance, updated_at: doc.updated_at, is_default: !doc.content };
}

export async function setMealPromptConfig(input: { template: string; guidance: Partial<Record<MealSlot, string>> }) {
  const guidance = { ...DEFAULT_MEAL_GUIDANCE };
  for (const { key } of MEAL_SLOTS) if (typeof input.guidance[key] === "string") guidance[key] = input.guidance[key]!;
  await setSettingsDoc(PROMPT_KEY, JSON.stringify({ template: input.template, guidance }));
  return getMealPromptConfig();
}

/** Back to the defaults: drop the saved row entirely. */
export async function resetMealPromptConfig() {
  await getDb()`DELETE FROM app_settings WHERE key = ${PROMPT_KEY}`;
  return getMealPromptConfig();
}

const list = (lines: string[]) => (lines.length ? lines.join("\n") : "(none)");

/** The live data behind every placeholder except slot/date/guidance. */
async function gatherVariables(date: string): Promise<Record<string, string>> {
  const sql = getDb();
  const [staples, thoughts, notes, recent, feedback, recipes, sameDay, target] = await Promise.all([
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
  return {
    notes: notes ? notes.slice(0, 3000) : "(none)",
    protein_target: String(target),
    planned_today: sameDay.length
      ? `${planned} g so far — ${sameDay.map((r) => `${r.slot}: ${r.name} (${r.protein_g ?? "?"} g)`).join("; ")}`
      : "nothing yet",
    staples: list(staples.map((s) => `- ${s.name}${s.why ? ` — ${s.why}` : ""}`)),
    food_thoughts: list(thoughts.map((p) => `- ${String(p.content).replace(/\s+/g, " ").slice(0, 300)}`)),
    recipes: list(recipes.map((r) => `- ${r.name}${r.slot ? ` (${r.slot})` : ""}${r.protein_g ? ` — ${r.protein_g} g protein` : ""}`)),
    recent_meals: list(
      recent.map((r) => `- ${String(r.eaten_date).slice(0, 10)} ${r.slot ?? ""} ${r.name}${r.felt_good ? "" : " (felt off)"}`),
    ),
    feedback: list(feedback.map((f) => `- ${f.slot}: ${f.name} → ${f.feedback}`)),
  };
}

/** Fills {{name}} placeholders; unknown ones are left as typed so a typo shows up in the preview. */
export function renderMealPrompt(template: string, vars: Record<string, string>) {
  return template.replace(/\{\{\s*([a-z_]+)\s*\}\}/gi, (whole, name: string) => vars[name.toLowerCase()] ?? whole);
}

/**
 * The exact prompt a suggestion for this sitting and day is sent. Pass a
 * draft config to preview unsaved edits; otherwise the saved one is used.
 */
export async function buildMealPrompt(
  slot: MealSlot,
  date: string,
  draft?: { template: string; guidance: Partial<Record<MealSlot, string>> },
) {
  const meta = MEAL_SLOTS.find((s) => s.key === slot);
  if (!meta) throw new Error(`Unknown meal slot: ${slot}`);
  const config = draft ?? (await getMealPromptConfig());
  const vars = {
    slot: meta.label.toUpperCase(),
    date,
    guidance: config.guidance[slot] ?? DEFAULT_MEAL_GUIDANCE[slot],
    ...(await gatherVariables(date)),
  };
  return renderMealPrompt(config.template, vars);
}

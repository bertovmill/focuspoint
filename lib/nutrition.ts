// The nutrition protocol — Tony Robbins' discipline of eating, which Berto
// chose to go all in on (2026-10-23), replacing the four rules he'd written
// down over July–August. A day counts as "on protocol" only when every rule
// was kept. Older nutrition_days rows still carry old keys (including
// fruit_alone, dropped 2026-10-26 because he doesn't eat fruit alone in the
// morning); normalizeRules ignores them.

export const PROTOCOL_RULES = [
  {
    key: "water_rich",
    label: "70% water-rich food",
    detail: "Most of every plate is fresh vegetables, greens and fruit — food that's ~70% water, like the body.",
  },
  {
    key: "combining",
    label: "No protein with starch",
    detail: "Never pair animal protein with starch in one meal. Protein + vegetables, or starch + vegetables.",
  },
  {
    key: "alkaline",
    label: "Alkaline, greens first",
    detail: "Lean on greens, sprouts and vegetables. Go light on meat, dairy, sugar, coffee and alcohol.",
  },
] as const;

// Photoreal art for the rules, generated once into Vercel Blob and cached
// by rule_key in nutrition_rule_art (the rules themselves rarely change).
export const RULE_IMAGE_PROMPTS: Record<string, string> = {
  water_rich:
    "a big bright bowl of crisp water-rich vegetables — cucumber, romaine, tomato, celery, watermelon radish — glistening with droplets",
  combining:
    "two separate plates side by side: grilled salmon on a bed of greens, and roasted sweet potato with broccoli — clearly kept apart",
  alkaline:
    "a vivid spread of dark leafy greens, sprouts, avocado, lemon halves and a tall glass of green juice",
};

export type ProtocolRuleKey = (typeof PROTOCOL_RULES)[number]["key"];

export const PROTOCOL_RULE_KEYS = PROTOCOL_RULES.map((r) => r.key) as readonly string[];

/** Drops anything that isn't a known rule key, and de-duplicates. */
export function normalizeRules(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  return PROTOCOL_RULE_KEYS.filter((k) => input.includes(k));
}

export function isOnProtocol(rules: readonly string[] | null | undefined) {
  return PROTOCOL_RULE_KEYS.every((k) => rules?.includes(k));
}

// A day is Meal 1, Meal 2, Meal 3 and an optional Snack — numbered, not
// breakfast/lunch/dinner, because when he eats moves around. Every one is a
// meal from the bank (fillFromBank in lib/nutrition-plan.ts). Days before
// 2026-10-04 used lunch/snack/dinner; those rows stay in the tables as an
// archive and the grid doesn't show them (old snacks became 'archived_snack',
// scripts/meals-numbered-migrate.mjs).
export const MEAL_SLOTS = [
  { key: "meal1", label: "Meal 1" },
  { key: "meal2", label: "Meal 2" },
  { key: "meal3", label: "Meal 3" },
] as const;

export const SNACK_SLOT = { key: "snack", label: "Snack" } as const;

/** Every sitting a plan or log row can carry: the three meals, then the snack. */
export const ALL_SLOTS = [...MEAL_SLOTS, SNACK_SLOT] as const;

export type MealSlot = (typeof ALL_SLOTS)[number]["key"];

export const MEAL_SLOT_KEYS = ALL_SLOTS.map((s) => s.key) as readonly string[];

const LEGACY_LABELS: Record<string, string> = { lunch: "Lunch", dinner: "Dinner", archived_snack: "Snack" };

export function slotLabel(slot: string | null | undefined) {
  if (!slot) return null;
  return ALL_SLOTS.find((s) => s.key === slot)?.label ?? LEGACY_LABELS[slot] ?? null;
}

/** The meals to show for a day: always the three, plus the snack once there's one. */
export function slotsShown(hasSnack: boolean) {
  return hasSnack ? ALL_SLOTS : MEAL_SLOTS;
}

/** SQL ORDER BY fragment for the slot column: meals in order, snack, then archived sittings. */
export const SLOT_ORDER_SQL = "CASE slot WHEN 'meal1' THEN 1 WHEN 'meal2' THEN 2 WHEN 'meal3' THEN 3 WHEN 'snack' THEN 4 ELSE 5 END";

/** Tags that mark a thought as belonging to the food/energy body of notes. */
export const NUTRITION_TAGS = [
  "nutrition",
  "food",
  "grocery",
  "energy",
  "meal-preference",
  "fasting",
  "cooking",
] as const;

export function todayISO() {
  // Local date, not UTC — a day logged at 9pm ET must not land on tomorrow.
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Neon returns DATE columns as midnight-UTC timestamps; keep just the day part. */
export function dateKey(value: string) {
  return value.slice(0, 10);
}

// ── Meal plan ─────────────────────────────────────────────────────────────
// Protein is the one macro Berto tracks against a target (calories ride along
// for context). 145 g is ~0.8 g per lb at 180 lb; the real number lives in
// app_settings and is editable from /meals.
export const DEFAULT_PROTEIN_TARGET_G = 160;
export const PROTEIN_TARGET_SETTING_KEY = "nutrition.protein_target_g";

export function addDaysISO(iso: string, n: number) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d + n);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** Monday of the week that contains `iso` — the grid runs Monday to Sunday. */
export function weekStartISO(iso: string = todayISO()) {
  const [y, m, d] = iso.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay(); // 0 = Sunday
  return addDaysISO(iso, dow === 0 ? -6 : 1 - dow);
}

export function weekDates(startISO: string) {
  return Array.from({ length: 7 }, (_, i) => addDaysISO(startISO, i));
}

export function shortDayLabel(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", day: "numeric" });
}

/** "Sep 28 – Oct 4" for the week header. */
export function weekRangeLabel(startISO: string) {
  const fmt = (iso: string) => {
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  return `${fmt(startISO)} – ${fmt(addDaysISO(startISO, 6))}`;
}

/** Accepts an array, or one string split on newlines / commas; trims, drops pasted list bullets, and de-duplicates. */
export function normalizeIngredients(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.map(String)
    : typeof input === "string"
      ? input.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim().replace(/^(?:[-*•]|\d+[.)])\s+/, "").trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** Numeric or null — Neon hands NUMERIC back as a string. */
export function num(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** /meals/recipes/<id>-<slug> — the id is what's read; the slug is for people. */
export function recipeHref(recipe: { id: number; name: string }) {
  const slug = recipe.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
  return `/meals/recipes/${recipe.id}-${slug}`;
}

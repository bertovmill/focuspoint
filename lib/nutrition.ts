// The nutrition protocol — the four rules Berto has already written down for
// himself (captured as thoughts tagged nutrition/energy over July–August 2026).
// A day counts as "on protocol" only when all four were kept; the headline
// number on the Nutrition screen is the share of days that cleared that bar.

export const PROTOCOL_RULES = [
  {
    key: "whole_food",
    label: "Whole food only",
    detail: "Vegetarian whole food — no dairy, no sugar. Dairy and sugar cause the brain fog.",
  },
  {
    key: "fasted",
    label: "Fasted until afternoon",
    detail: "Nothing until late afternoon. The mental dial-in is the whole point.",
  },
  {
    key: "snack_light",
    label: "Snacked light, real dinner",
    detail: "Never eat meals during the day — snack. Avocado and dark chocolate. Full dinner in the evening.",
  },
  {
    key: "pff",
    label: "Protein + fat + fibre",
    detail: "The formula for stable energy: protein blunts the glucose response, fat slows digestion, fibre slows absorption.",
  },
] as const;

// Photoreal art for the four rules, generated once into Vercel Blob and cached
// by rule_key in nutrition_rule_art (the rules themselves never change).
export const RULE_IMAGE_PROMPTS: Record<string, string> = {
  whole_food:
    "a generous wooden board of raw whole foods — leafy greens, broccoli, sweet potato, lentils, avocado, brown rice in a small bowl — no dairy, no packaging, no sweets",
  fasted:
    "an empty clean ceramic plate with a single glass of water beside it on a bare table, early morning light raking across the surface, nothing else",
  snack_light:
    "a small plate holding half an avocado, three squares of very dark chocolate and a scattering of almonds, mid-afternoon light",
  pff:
    "a shallow bowl showing three clear components side by side — a portion of plant protein, sliced avocado for fat, and leafy greens with lentils for fibre",
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

/** Accepts an array, or one string split on newlines / commas; trims and de-duplicates. */
export function normalizeIngredients(input: unknown): string[] {
  const raw = Array.isArray(input)
    ? input.map(String)
    : typeof input === "string"
      ? input.split(/[\n,]/)
      : [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    const t = item.trim();
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

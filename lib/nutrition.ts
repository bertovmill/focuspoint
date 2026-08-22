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

// The three sittings Berto eats: one lunch, one snack, one dinner. Cael fills all
// three in each morning (see lib/meal-suggest.ts).
export const MEAL_SLOTS = [
  { key: "lunch", label: "Lunch", guidance: "Light and whole-food — this is the day-time sitting, so it must not sit heavy or spike blood sugar." },
  { key: "snack", label: "Snack", guidance: "A small afternoon snack for mental performance — think avocado, dark chocolate, almonds. Not a meal." },
  { key: "dinner", label: "Dinner", guidance: "The real meal of the day, eaten in the evening. Protein + fat + fibre, substantial and satisfying." },
] as const;

export type MealSlot = (typeof MEAL_SLOTS)[number]["key"];

export const MEAL_SLOT_KEYS = MEAL_SLOTS.map((s) => s.key) as readonly string[];

export function slotLabel(slot: string | null | undefined) {
  return MEAL_SLOTS.find((s) => s.key === slot)?.label ?? null;
}

/**
 * Which sitting is the live one right now: lunch through the afternoon, the snack
 * in the 3–6pm dip he's written about, dinner in the evening.
 */
export function currentSlot(now: Date = new Date()): MealSlot {
  const h = now.getHours();
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

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

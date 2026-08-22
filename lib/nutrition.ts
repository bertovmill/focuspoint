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

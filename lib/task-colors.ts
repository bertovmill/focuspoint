// Card colours are a *cosmetic* label Berto paints on a task by right-clicking it —
// deliberately independent of in_progress/waiting so a card can mean whatever he
// wants it to. The working convention is yellow = pending, green = in progress, but
// nothing in the code enforces that.
// No db import here: the client canvas and the API routes both import these.
export const CARD_COLORS = ["yellow", "green", "blue", "purple"] as const;

export type CardColor = (typeof CARD_COLORS)[number];

export const CARD_COLOR_LABELS: Record<CardColor, string> = {
  yellow: "Pending",
  green: "In progress",
  blue: "Blue",
  purple: "Purple",
};

// Tailwind can't see interpolated class names, so every variant is spelled out.
// Light mode gets a solid sticky-note wash; dark mode a low-alpha tint over the
// card surface, which reads better against the canvas than a pastel block.
export const CARD_COLOR_CLASSES: Record<CardColor, string> = {
  yellow: "border-amber-300 bg-amber-100/90 dark:border-amber-400/40 dark:bg-amber-400/15",
  green: "border-emerald-300 bg-emerald-100/90 dark:border-emerald-400/40 dark:bg-emerald-400/15",
  blue: "border-sky-300 bg-sky-100/90 dark:border-sky-400/40 dark:bg-sky-400/15",
  purple: "border-violet-300 bg-violet-100/90 dark:border-violet-400/40 dark:bg-violet-400/15",
};

// The dot shown in the context menu. Solid fill in both themes so the swatch row
// reads as a palette rather than as four greyish circles.
export const CARD_COLOR_SWATCH_CLASSES: Record<CardColor, string> = {
  yellow: "bg-amber-400",
  green: "bg-emerald-500",
  blue: "bg-sky-500",
  purple: "bg-violet-500",
};

// Accepts anything an API caller or the agent might send, and returns a stored
// value or null (= plain card). Unknown strings become null rather than an error.
export function normalizeCardColor(value: unknown): CardColor | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  return (CARD_COLORS as readonly string[]).includes(key) ? (key as CardColor) : null;
}

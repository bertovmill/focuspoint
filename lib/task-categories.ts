// The only few kinds of work worth labelling — everything else Berto does is
// just "a task", so category is optional and NULL is the normal case.
// No db import here — the client dashboard and the agent tools both import these.
export const TASK_CATEGORIES = [
  "events",
  "calls",
  "ai_agents",
  "content",
  "code",
  "community",
  "sales",
] as const;

export type TaskCategory = (typeof TASK_CATEGORIES)[number];

export const TASK_CATEGORY_LABELS: Record<TaskCategory, string> = {
  events: "Events",
  calls: "Calls",
  ai_agents: "AI Agents",
  content: "Content",
  code: "Code",
  community: "Community",
  sales: "Sales",
};

// The badge a category wears on a task card, wherever that card is drawn — the
// canvas on desktop, the list on mobile. Spelled out per category because Tailwind
// can't see class names it has to interpolate.
export const CATEGORY_BADGE_CLASS: Record<TaskCategory, string> = {
  events: "border-violet-500/40 text-violet-600 dark:text-violet-400",
  calls: "border-sky-500/40 text-sky-600 dark:text-sky-400",
  ai_agents: "border-emerald-500/40 text-emerald-600 dark:text-emerald-400",
  content: "border-amber-500/40 text-amber-600 dark:text-amber-400",
  code: "border-indigo-500/40 text-indigo-600 dark:text-indigo-400",
  community: "border-rose-500/40 text-rose-600 dark:text-rose-400",
  sales: "border-green-600/40 text-green-700 dark:text-green-400",
};

// The categories that get their own pipeline lane on the Tasks canvas, in the order
// they stack down the panel. A task in one of these is a *piece* — a thing to ship,
// with its own checklist hanging off it (see lib/todo.ts). Everything else is a
// plain label on a canvas card.
export const LANE_CATEGORIES = ["content", "code", "community", "sales"] as const;

export type LaneCategory = (typeof LANE_CATEGORIES)[number];

export function isLaneCategory(value: unknown): value is LaneCategory {
  return typeof value === "string" && (LANE_CATEGORIES as readonly string[]).includes(value);
}

// Accepts anything an API caller or the agent might send ("AI Agents", "calls",
// null, ""), and returns a stored value or null. Unknown strings become null
// rather than an error — a mislabelled category shouldn't block saving a task.
export function normalizeCategory(value: unknown): TaskCategory | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return (TASK_CATEGORIES as readonly string[]).includes(key) ? (key as TaskCategory) : null;
}

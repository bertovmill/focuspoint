// How the home Tasks block orders its rows: Berto's drag order, or a column sort
// picked by clicking a header. Kept in app_settings (see
// app/api/home-tasks-layout/route.ts) so the web app, Mac app and phone agree.
export const HOME_TASKS_LAYOUT_KEY = "tasks.home-layout.json";

export const HOME_SORT_KEYS = ["title", "status", "due", "priority"] as const;
export type HomeSortKey = (typeof HOME_SORT_KEYS)[number];

export interface HomeTasksLayout {
  // Task ids in drag order. Tasks not listed (new, or added by an agent) follow
  // in the API's order.
  order: number[];
  // null = use the drag order.
  sort: { key: HomeSortKey; dir: "asc" | "desc" } | null;
}

export const DEFAULT_HOME_TASKS_LAYOUT: HomeTasksLayout = { order: [], sort: null };

export function parseHomeTasksLayout(raw: unknown): HomeTasksLayout | null {
  if (!raw || typeof raw !== "object") return null;
  const { order, sort } = raw as Record<string, unknown>;
  if (!Array.isArray(order) || !order.every((id) => Number.isInteger(id))) return null;
  if (sort === null || sort === undefined) return { order: order as number[], sort: null };
  const { key, dir } = sort as Record<string, unknown>;
  if (!HOME_SORT_KEYS.includes(key as HomeSortKey) || (dir !== "asc" && dir !== "desc")) return null;
  return { order: order as number[], sort: { key: key as HomeSortKey, dir } };
}

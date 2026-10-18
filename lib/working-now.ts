// Human limit: only so many tasks can be "working on now" at once. Five is the
// ceiling, but the number is Berto's to set from the pinned window — on a day
// where one thing matters, the limit is 1 and the window shows exactly that one
// task. Enforced server-side so the agent and the API can't quietly push past
// what the UI allows.
//
// No db import at module scope here — the client dashboard imports the constants
// and the helpers below take their `sql` from the caller.

/** The most things that can ever be in flight, whatever the setting says. */
export const WORKING_LIMIT_MAX = 5;
/** The fewest — one thing at a time is focus, zero is a stopped board. */
export const WORKING_LIMIT_MIN = 1;
/** What the limit is until Berto changes it. */
export const WORKING_LIMIT_DEFAULT = WORKING_LIMIT_MAX;

/** Kept as the ceiling for prompts and copy that need a fixed number. */
export const WORKING_LIMIT = WORKING_LIMIT_MAX;

const SETTING_KEY = "working_limit";

export function clampWorkingLimit(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return WORKING_LIMIT_DEFAULT;
  return Math.min(WORKING_LIMIT_MAX, Math.max(WORKING_LIMIT_MIN, n));
}

export function workingLimitMessage(limit: number): string {
  return limit === 1
    ? "You're focused on one thing at a time right now — finish or drop it first, or raise the limit in the pinned window."
    : `You can only work on ${limit} things at once — finish or drop one first.`;
}

/** The generic message, for copy written before the limit is known. */
export const WORKING_LIMIT_MESSAGE = workingLimitMessage(WORKING_LIMIT_DEFAULT);

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

/** How many things Berto is letting himself work on at once. */
export async function getWorkingLimit(sql: Sql): Promise<number> {
  try {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = ${SETTING_KEY}`;
    if (!row) return WORKING_LIMIT_DEFAULT;
    return clampWorkingLimit(row.value);
  } catch {
    // Table not created yet (first boot) — the default is the honest answer.
    return WORKING_LIMIT_DEFAULT;
  }
}

/** Set the limit. Returns what was actually stored, after clamping. */
export async function setWorkingLimit(sql: Sql, value: unknown): Promise<number> {
  const limit = clampWorkingLimit(value);
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${SETTING_KEY}, ${String(limit)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return limit;
}

export type WorkingSlot = { allowed: boolean; limit: number };

/**
 * Whether `excludeId` can be marked in progress without exceeding the limit.
 * A task that's *already* in progress always passes — lowering the limit while
 * five things are running leaves those five alone and only blocks new ones, so
 * pausing and resuming one of them must never be refused.
 */
export async function hasWorkingSlot(sql: Sql, excludeId?: number | string): Promise<WorkingSlot> {
  const id = excludeId ?? -1;
  const limit = await getWorkingLimit(sql);
  const [row] = await sql`
    SELECT
      (SELECT COUNT(*)::int FROM todos
         WHERE in_progress = TRUE AND completed = FALSE AND id <> ${id}) AS others,
      (SELECT in_progress FROM todos WHERE id = ${id}) AS already
  `;
  if (row?.already) return { allowed: true, limit };
  return { allowed: Number(row?.others ?? 0) < limit, limit };
}

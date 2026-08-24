// Human limit: at most five tasks can be "working on now" at once. Enforced
// server-side so the agent and the API can't quietly push past what the UI allows.
// No db import here — the client dashboard imports these constants too.
export const WORKING_LIMIT = 5;

export const WORKING_LIMIT_MESSAGE = `You can only work on ${WORKING_LIMIT} things at once — finish or drop one first.`;

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

// True when `excludeId` can be marked in progress without exceeding the limit.
// A task that's already in progress doesn't consume a new slot.
export async function hasWorkingSlot(sql: Sql, excludeId?: number | string) {
  const [row] = await sql`
    SELECT COUNT(*)::int AS n FROM todos
    WHERE in_progress = TRUE AND completed = FALSE AND id <> ${excludeId ?? -1}
  `;
  return Number(row?.n ?? 0) < WORKING_LIMIT;
}

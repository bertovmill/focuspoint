// Gamification: the streak and the points.
//
// Berto's ask: "I want to get addicted to getting tasks done, because success is
// getting the details done productively and never stalling." So two numbers, doing
// two different jobs:
//
//  - **The streak** is the one that hurts to lose. A day only counts if he finished
//    at least `daily_goal` tasks (default 5) — "any task done" would keep a streak
//    alive on a day he coasted, which is exactly the day the number should notice.
//  - **The points** are the per-task hit. Every completion pays something, weighted
//    by priority and estimate, so a 2h high-priority slog isn't worth the same as
//    ticking off "expense the mochi donuts".
//
// Days are bucketed in Berto's timezone, not UTC — a task finished at 8pm Toronto
// belongs to that day, and a UTC bucket would push it into tomorrow.
//
// No db import at module scope: the helpers take their `sql` from the caller and the
// client components import the pure bits (see lib/working-now.ts for the same shape).

/** Timezone the day boundary is drawn in. Matches agent/lib/now.ts. */
export const STREAK_TIME_ZONE = process.env.GOOGLE_CALENDAR_TIMEZONE ?? "America/Toronto";

export const DAILY_GOAL_MIN = 1;
export const DAILY_GOAL_MAX = 20;
export const DAILY_GOAL_DEFAULT = 5;

const GOAL_SETTING_KEY = "daily_goal";

/** How far back the history query looks. Enough for a best-streak worth bragging about. */
const HISTORY_DAYS = 365;

/** How many days the chip's popover draws. */
export const RECENT_DAYS = 14;

export function clampDailyGoal(value: unknown): number {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return DAILY_GOAL_DEFAULT;
  return Math.min(DAILY_GOAL_MAX, Math.max(DAILY_GOAL_MIN, n));
}

// ---------------------------------------------------------------------- points

/** What one finished task is worth. */
export type ScorableTask = {
  priority?: string | null;
  estimated_minutes?: number | null;
};

/**
 * Points for a single completed task: a flat base, plus what the task cost you.
 *
 * IMPORTANT: `pointsSql()` below is the same formula in SQL, for the all-time
 * total. Change one, change the other.
 */
export function taskPoints(t: ScorableTask): number {
  const priority = (t.priority ?? "").toLowerCase();
  const priorityBonus = priority === "high" ? 10 : priority === "medium" ? 5 : 0;
  // 1 point per 10 minutes of estimate, capped so a half-day estimate doesn't
  // dwarf everything else on the board.
  const sizeBonus = Math.min(20, Math.floor(Math.max(0, t.estimated_minutes ?? 0) / 10));
  return 10 + priorityBonus + sizeBonus;
}

/** `taskPoints` as a SQL expression, for summing history without fetching it. */
const POINTS_SQL = `10
  + CASE lower(coalesce(priority, '')) WHEN 'high' THEN 10 WHEN 'medium' THEN 5 ELSE 0 END
  + LEAST(20, FLOOR(GREATEST(0, COALESCE(estimated_minutes, 0)) / 10))`;

// ---------------------------------------------------------------------- days

/** One day of history. `date` is a YYYY-MM-DD key in STREAK_TIME_ZONE. */
export type StreakDay = {
  date: string;
  tasks: number;
  points: number;
  hit: boolean;
};

export type StreakSummary = {
  /** Consecutive goal-hitting days ending today (or yesterday, if today isn't won yet). */
  streak: number;
  /** The longest run in the last year — the number to beat. */
  bestStreak: number;
  /** Tasks finished today, and the goal they're measured against. */
  doneToday: number;
  goal: number;
  /** True once today's goal is met — i.e. today is already banked. */
  todayHit: boolean;
  /** A streak that's alive but not yet extended today: today is the day it can break. */
  atRisk: boolean;
  pointsToday: number;
  /** All-time points, across every task ever completed. */
  totalPoints: number;
  /** Newest last: the last RECENT_DAYS days, for the little grid. */
  recent: StreakDay[];
};

/** The YYYY-MM-DD key a timestamp falls on, in Berto's timezone. */
export function dayKey(d: Date, timeZone = STREAK_TIME_ZONE): string {
  // en-CA formats as YYYY-MM-DD, which is exactly the key we want.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** The key `back` days before `from`. Walks in UTC noon so DST can't skip a day. */
function shiftDayKey(key: string, back: number): string {
  const [y, m, d] = key.split("-").map(Number);
  const base = Date.UTC(y, m - 1, d, 12);
  return dayKey(new Date(base - back * 86_400_000), "UTC");
}

/**
 * The streak, given a date→day map and the goal.
 *
 * Today not being won yet does *not* break the streak — it's still in play until
 * midnight. So the count starts at today when today is a hit, and at yesterday
 * otherwise; `atRisk` is what the UI uses to say "today's the day it breaks".
 */
export function computeStreak(byDate: Map<string, StreakDay>, todayKey: string) {
  const hit = (key: string) => (byDate.get(key)?.hit ?? false);
  const todayHit = hit(todayKey);

  let streak = 0;
  let cursor = todayHit ? todayKey : shiftDayKey(todayKey, 1);
  while (hit(cursor)) {
    streak += 1;
    cursor = shiftDayKey(cursor, 1);
  }

  // Best run anywhere in the window: walk the keys in order and count runs of
  // consecutive calendar days that were hits.
  let bestStreak = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of [...byDate.keys()].sort()) {
    if (!byDate.get(key)!.hit) {
      run = 0;
      prev = key;
      continue;
    }
    run = prev !== null && shiftDayKey(key, 1) === prev ? run + 1 : 1;
    bestStreak = Math.max(bestStreak, run);
    prev = key;
  }

  return { streak, bestStreak: Math.max(bestStreak, streak), todayHit, atRisk: streak > 0 && !todayHit };
}

// ---------------------------------------------------------------------- db

type Sql = {
  (strings: TemplateStringsArray, ...values: unknown[]): Promise<Record<string, unknown>[]>;
  unsafe: (s: string) => unknown;
};

/** How many tasks a day needs to count. Berto's to set. */
export async function getDailyGoal(sql: Sql): Promise<number> {
  try {
    const [row] = await sql`SELECT value FROM app_settings WHERE key = ${GOAL_SETTING_KEY}`;
    if (!row) return DAILY_GOAL_DEFAULT;
    return clampDailyGoal(row.value);
  } catch {
    // Table not created yet (first boot) — the default is the honest answer.
    return DAILY_GOAL_DEFAULT;
  }
}

/** Set the goal. Returns what was actually stored, after clamping. */
export async function setDailyGoal(sql: Sql, value: unknown): Promise<number> {
  const goal = clampDailyGoal(value);
  await sql`
    INSERT INTO app_settings (key, value, updated_at) VALUES (${GOAL_SETTING_KEY}, ${String(goal)}, NOW())
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `;
  return goal;
}

/**
 * Everything the chip needs, in two queries: a year of per-day totals, and the
 * all-time points sum.
 *
 * Recurring tasks keep `completed = FALSE` and just move `completed_at` (see
 * lib/tasks.ts), so this filters on `completed_at` alone — otherwise a daily habit
 * would never count toward the streak it's most obviously part of.
 */
export async function getStreakSummary(sql: Sql): Promise<StreakSummary> {
  const goal = await getDailyGoal(sql);
  const todayKey = dayKey(new Date());

  const [dayRows, totals] = await Promise.all([
    sql`
      SELECT to_char(completed_at AT TIME ZONE ${STREAK_TIME_ZONE}::text, 'YYYY-MM-DD') AS date,
             COUNT(*)::int AS tasks,
             COALESCE(SUM(${sql.unsafe(POINTS_SQL)}), 0)::int AS points
      FROM todos
      WHERE completed_at IS NOT NULL
        AND completed_at >= NOW() - ${sql.unsafe(`INTERVAL '${HISTORY_DAYS} days'`)}
      GROUP BY 1
      ORDER BY 1
    `,
    sql`
      SELECT COALESCE(SUM(${sql.unsafe(POINTS_SQL)}), 0)::int AS points
      FROM todos WHERE completed_at IS NOT NULL
    `,
  ]);

  const byDate = new Map<string, StreakDay>();
  for (const r of dayRows) {
    const date = String(r.date);
    const tasks = Number(r.tasks) || 0;
    byDate.set(date, { date, tasks, points: Number(r.points) || 0, hit: tasks >= goal });
  }

  const { streak, bestStreak, todayHit, atRisk } = computeStreak(byDate, todayKey);
  const today = byDate.get(todayKey);

  const recent: StreakDay[] = [];
  for (let i = RECENT_DAYS - 1; i >= 0; i--) {
    const key = shiftDayKey(todayKey, i);
    recent.push(byDate.get(key) ?? { date: key, tasks: 0, points: 0, hit: false });
  }

  return {
    streak,
    bestStreak,
    doneToday: today?.tasks ?? 0,
    goal,
    todayHit,
    atRisk,
    pointsToday: today?.points ?? 0,
    totalPoints: Number(totals[0]?.points) || 0,
    recent,
  };
}

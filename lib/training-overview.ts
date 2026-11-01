// /training/progress — the "why I'm doing this" page (Berto, 2026-11-01): Shopify-admin
// style stat tiles with change vs before, the Dec 31 goals as progress bars, and two
// weekly trends (workouts done, % better than last time).
import { getDb } from "./db";
import { addDaysISO, weekStartISO } from "./nutrition";
import { weeklyProgress } from "./progress";
import { getAllStrengthLogs } from "./strength";
import { daysUntil, getEvents } from "./training";
import { listWorkouts } from "./workout-bank";
import { formatTime, goalProgress, templateExercises, totalReps, workoutHref, type StrengthLog } from "./workout-templates";

export interface GoalRow {
  slug: string;
  workout: string;
  name: string;
  /** The goal in his words. */
  label: string;
  /** Where the latest log stands ("190 lbs", "4:16"), null before the first one. */
  now: string | null;
  pct: number | null;
  href: string;
}

export interface WorkoutGoals {
  slug: string;
  name: string;
  /** Average % of the goals that can be measured yet; null when none can. */
  pct: number | null;
  measured: number;
  hit: number;
  total: number;
}

export interface TrainingOverview {
  /** Workouts done in the last 30 days, and in the 30 before. */
  month: { done: number; prev: number };
  week: { change: number | null; prev: number | null };
  race: { name: string; days: number } | null;
  goals: GoalRow[];
  /** His standard workouts that have goals, in default-week order, each at the average of its goals. */
  workouts: WorkoutGoals[];
  weeks: { start: string; done: number; change: number | null }[];
}

const times = (l: StrengthLog) => l.reps.filter((n): n is number => n !== null && n > 0);

export async function trainingOverview(today: string): Promise<TrainingOverview> {
  const sql = getDb();
  const [logs, workouts, events] = await Promise.all([getAllStrengthLogs(), listWorkouts(), getEvents()]);

  // Workouts done in the last 30 days vs the 30 before (a calendar month reads 0 on the 1st).
  const monthStart = addDaysISO(today, -29);
  const prevStart = addDaysISO(today, -59);
  const prevEnd = addDaysISO(today, -30);
  // Eight weeks back, Monday-start, this week included.
  const firstWeek = addDaysISO(weekStartISO(today), -7 * 7);
  const [counts] = await sql`
    SELECT
      COUNT(*) FILTER (WHERE session_date BETWEEN ${monthStart} AND ${today})::int AS month,
      COUNT(*) FILTER (WHERE session_date BETWEEN ${prevStart} AND ${prevEnd})::int AS prev
    FROM training_sessions WHERE done = TRUE AND type <> 'rest'
  `;
  const weekly = await sql`
    SELECT to_char(date_trunc('week', session_date), 'YYYY-MM-DD') AS start, COUNT(*)::int AS n
    FROM training_sessions WHERE done = TRUE AND type <> 'rest' AND session_date BETWEEN ${firstWeek} AND ${today}
    GROUP BY 1
  `;
  const doneByWeek = new Map(weekly.map((r) => [String(r.start), Number(r.n)]));

  const weeks: TrainingOverview["weeks"] = [];
  for (let i = 0; i < 8; i++) {
    const start = addDaysISO(firstWeek, 7 * i);
    const end = i === 7 ? today : addDaysISO(start, 6);
    const p = await weeklyProgress(end, logs);
    weeks.push({ start, done: doneByWeek.get(start) ?? 0, change: p.change });
  }

  // Goals: each against the latest log of that exercise. Repeats of one goal in a workout
  // (the three runs in Stations) show once, at the best of them.
  const goals = new Map<string, GoalRow>();
  for (const t of workouts) {
    for (const ex of templateExercises(t)) {
      if (!ex.goal) continue;
      const mine = logs.filter((l) => l.template === t.slug && l.exercise === ex.key && times(l).length > 0);
      const last = mine.at(-1) ?? null;
      const best = last ? Math.min(...times(last)) : null;
      const first = mine[0] ? Math.min(...times(mine[0])) : null;
      const timed = ex.measure === "time";
      const g = goalProgress(ex, { weight: last?.weight ?? null, time: timed ? best : null, reps: last ? totalReps(last.reps) : undefined }, timed ? first : null);
      if (!g) continue;
      // A goal with nothing to measure against (a label only) shows no "now".
      const now = !last || g.pct === null ? null : timed ? (best !== null ? formatTime(best) : null) : `${last.weight ? `${last.weight} lbs` : "BW"} × ${Math.max(...times(last))}`;
      // Never logged: not started, rather than 0% of the way.
      const row: GoalRow = { slug: t.slug, workout: t.name, name: ex.name, label: g.text, now, pct: last ? g.pct : null, href: workoutHref(t.slug, last?.log_date ?? today) };
      const key = `${t.slug}|${ex.name}|${ex.goal.label}`;
      const had = goals.get(key);
      if (!had || (row.pct ?? -1) > (had.pct ?? -1)) goals.set(key, row);
    }
    if (t.goal) goals.set(`${t.slug}|*`, { slug: t.slug, workout: t.name, name: t.name, label: t.goal, now: null, pct: null, href: workoutHref(t.slug, today) });
  }

  const rows = [...goals.values()];
  const byWorkout: WorkoutGoals[] = [];
  // Monday's workout first; the ones with no set day after.
  for (const t of [...workouts].sort((a, b) => (a.default_day ?? 7) - (b.default_day ?? 7))) {
    const mine = rows.filter((g) => g.slug === t.slug);
    if (!mine.length) continue;
    const m = mine.filter((g) => g.pct !== null);
    byWorkout.push({
      slug: t.slug,
      name: t.name,
      pct: m.length ? m.reduce((n, g) => n + g.pct!, 0) / m.length : null,
      measured: m.length,
      hit: m.filter((g) => g.pct! >= 1).length,
      total: mine.length,
    });
  }

  const upcoming = events.map((e) => ({ name: e.name, days: daysUntil(e.event_date, today) })).filter((e) => e.days >= 0).sort((a, b) => a.days - b.days);
  return {
    month: { done: Number(counts.month), prev: Number(counts.prev) },
    week: { change: weeks[7].change, prev: weeks[6].change },
    race: upcoming[0] ?? null,
    goals: rows.sort((a, b) => (b.pct ?? -1) - (a.pct ?? -1)),
    workouts: byWorkout,
    weeks,
  };
}

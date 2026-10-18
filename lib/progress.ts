// "You've gotten X% better this week" (Berto, 2026-10-17). For every exercise logged in
// the past 7 days, compare it with the last time that same workout was done before:
//   - rep sets: volume = weight × total reps (total reps alone when there's no weight),
//     so adding reps OR weight both count — 38 → 40 reps is +5.3%;
//   - timed sets: average seconds per set, where faster is better.
// The weekly number is the plain average of those per-exercise changes, so a big jump on
// one small move can't swamp the rest.
import { addDaysISO } from "./nutrition";
import { getAllStrengthLogs } from "./strength";
import { getWorkout } from "./workout-bank";
import { templateExercises, type StrengthLog, type TemplateExercise } from "./workout-templates";

export interface ExerciseProgress {
  template: string;
  workout: string;
  exercise: string;
  name: string;
  date: string;
  before: string;
  now: string;
  /** Fractional change, positive = better (0.053 = 5.3% better). */
  change: number;
}

export interface WeeklyProgress {
  /** Average change across exercises, or null when nothing repeated this week. */
  change: number | null;
  items: ExerciseProgress[];
}

const values = (l: StrengthLog) => l.reps.filter((n): n is number => n !== null && n > 0);

function clock(sec: number) {
  const s = Math.round(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** One exercise, this time against last time. Null when the two can't be compared fairly. */
export function compare(ex: Pick<TemplateExercise, "measure" | "unit">, prev: StrengthLog, cur: StrengthLog): Omit<ExerciseProgress, "template" | "workout" | "exercise" | "name" | "date"> | null {
  const a = values(prev);
  const b = values(cur);
  if (a.length === 0 || b.length === 0) return null;

  if (ex.measure === "time") {
    // A timed set only means something next to how much it was (100 wall balls, later 120).
    if (prev.amount !== null && cur.amount !== null && prev.amount !== cur.amount) return null;
    const before = a.reduce((x, y) => x + y, 0) / a.length;
    const now = b.reduce((x, y) => x + y, 0) / b.length;
    return { before: `${clock(before)} avg`, now: `${clock(now)} avg`, change: (before - now) / before };
  }

  const unit = ex.unit === "m" ? "m" : "reps";
  const repsBefore = a.reduce((x, y) => x + y, 0);
  const repsNow = b.reduce((x, y) => x + y, 0);
  // Weight only counts when both sessions had one; otherwise compare reps to reps.
  const weighted = (prev.weight ?? 0) > 0 && (cur.weight ?? 0) > 0;
  const before = weighted ? prev.weight! * repsBefore : repsBefore;
  const now = weighted ? cur.weight! * repsNow : repsNow;
  const label = (w: number | null, r: number) => (weighted ? `${w} lb × ${r} ${unit}` : `${r} ${unit}`);
  return { before: label(prev.weight, repsBefore), now: label(cur.weight, repsNow), change: (now - before) / before };
}

export async function weeklyProgress(today: string): Promise<WeeklyProgress> {
  const logs = await getAllStrengthLogs();
  const from = addDaysISO(today, -6); // the past 7 days, today included
  const items: ExerciseProgress[] = [];

  // Latest log of each (workout, exercise) inside the window.
  const latest = new Map<string, StrengthLog>();
  for (const l of logs) if (l.log_date >= from && l.log_date <= today) latest.set(`${l.template}|${l.exercise}`, l);

  const templates = new Map<string, Awaited<ReturnType<typeof getWorkout>>>();
  for (const cur of latest.values()) {
    const prev = logs.filter((l) => l.template === cur.template && l.exercise === cur.exercise && l.log_date < cur.log_date).at(-1);
    if (!prev) continue;
    if (!templates.has(cur.template)) templates.set(cur.template, await getWorkout(cur.template));
    const t = templates.get(cur.template);
    const ex = t ? templateExercises(t).find((e) => e.key === cur.exercise) : undefined;
    const c = compare(ex ?? {}, prev, cur);
    if (!c) continue;
    items.push({ template: cur.template, workout: t?.name ?? cur.template, exercise: cur.exercise, name: ex?.name ?? cur.exercise, date: cur.log_date, ...c });
  }

  items.sort((x, y) => y.change - x.change);
  const change = items.length ? items.reduce((n, i) => n + i.change, 0) / items.length : null;
  return { change, items };
}

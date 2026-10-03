// Reads and writes for strength_logs — the reps typed into a structured workout
// at /training/workouts/<template>/<date>. Templates and progression rules live in
// lib/workout-templates.ts; this file only touches the database.
import { getDb } from "./db";
import { num } from "./nutrition";
import { getTemplate, nextPrescription, templateExercises, type Prescription, type StrengthLog } from "./workout-templates";

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  // Same DDL as lib/db.ts ensureSchema(), run on its own so a write doesn't walk every table.
  await getDb()`
    CREATE TABLE IF NOT EXISTS strength_logs (
      id SERIAL PRIMARY KEY,
      template TEXT NOT NULL,
      log_date DATE NOT NULL,
      exercise TEXT NOT NULL,
      weight NUMERIC,
      target_reps INTEGER NOT NULL,
      reps INTEGER[] NOT NULL DEFAULT '{}',
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(template, log_date, exercise)
    )
  `;
  tableReady = true;
}

function shape(r: Record<string, unknown>): StrengthLog {
  return {
    template: String(r.template),
    log_date: String(r.log_date),
    exercise: String(r.exercise),
    weight: num(r.weight),
    target_reps: Number(r.target_reps),
    // Postgres arrays can't hold a gap cleanly, so a skipped set is stored as -1.
    reps: ((r.reps as number[] | null) ?? []).map((n) => (Number(n) < 0 ? null : Number(n))),
  };
}

export async function getStrengthLogs(template: string): Promise<StrengthLog[]> {
  await ensureTable();
  const rows = await getDb()`
    SELECT template, to_char(log_date, 'YYYY-MM-DD') AS log_date, exercise, weight, target_reps, reps
    FROM strength_logs WHERE template = ${template} ORDER BY log_date ASC, exercise ASC
  `;
  return rows.map((r) => shape(r as Record<string, unknown>));
}

/**
 * Everything the session page needs: the day's logged rows, what each exercise
 * should aim for (from the last session before this date), and the full history
 * for the charts.
 */
export async function getWorkoutDay(slug: string, date: string) {
  const t = getTemplate(slug);
  if (!t) throw new Error(`Unknown workout: ${slug}`);
  const history = await getStrengthLogs(slug);
  const prescriptions: Record<string, Prescription & { last: StrengthLog | null }> = {};
  for (const ex of templateExercises(t)) {
    const before = history.filter((l) => l.exercise === ex.key && l.log_date < date);
    const last = before[before.length - 1] ?? null;
    prescriptions[ex.key] = { ...nextPrescription(ex, last), last };
  }
  return { date, logs: history.filter((l) => l.log_date === date), prescriptions, history };
}

export interface StrengthEntry {
  exercise: string;
  weight: number | null;
  target_reps: number;
  reps: (number | null)[];
}

/** Upserts the day's rows; an exercise with no reps typed is removed. */
export async function saveWorkoutDay(slug: string, date: string, entries: StrengthEntry[]) {
  const t = getTemplate(slug);
  if (!t) throw new Error(`Unknown workout: ${slug}`);
  const keys = new Set(templateExercises(t).map((e) => e.key));
  await ensureTable();
  const sql = getDb();
  for (const e of entries) {
    if (!keys.has(e.exercise)) continue;
    const reps = e.reps.map((r) => (r === null || !Number.isFinite(r) ? -1 : Math.max(0, Math.round(r))));
    while (reps.length && reps[reps.length - 1] === -1) reps.pop();
    if (reps.length === 0) {
      await sql`DELETE FROM strength_logs WHERE template = ${slug} AND log_date = ${date} AND exercise = ${e.exercise}`;
      continue;
    }
    await sql`
      INSERT INTO strength_logs (template, log_date, exercise, weight, target_reps, reps, updated_at)
      VALUES (${slug}, ${date}, ${e.exercise}, ${e.weight}, ${Math.round(e.target_reps)}, ${reps}, NOW())
      ON CONFLICT (template, log_date, exercise) DO UPDATE SET
        weight = EXCLUDED.weight, target_reps = EXCLUDED.target_reps, reps = EXCLUDED.reps, updated_at = NOW()
    `;
  }
  // Logging the workout counts as doing it: tick the matching planned session.
  await sql`
    UPDATE training_sessions SET done = TRUE, done_at = COALESCE(done_at, NOW()), updated_at = NOW()
    WHERE session_date = ${date} AND type = 'strength' AND done = FALSE AND title ~* ${t.match.source}
  `;
  return getWorkoutDay(slug, date);
}

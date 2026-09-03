// Core habits — read / meditate / journal / fast till noon.
//
// Deliberately separate from the scored 3-metric scorecard (lib/scorecard.ts):
// Berto's call (2026-09-03) was that the rings stay the only scored thing — this is
// a plain daily checklist underneath, worth nothing in points. Read and journal are
// derived from things he already logs elsewhere (Kindle notes via reading_notes, the
// daily journal page) so there's nothing new to tap for those two; meditation and
// fasting have no existing tracker, so those two are a manual toggle in `daily_habits`.

import { dayKey } from "@/lib/streak";

export type HabitKey = "read" | "meditate" | "journal" | "fast";

export type HabitDef = {
  key: HabitKey;
  label: string;
  hint: string;
  /** False = derived from other tables; the card only lets manual habits be tapped. */
  manual: boolean;
};

export const HABITS: HabitDef[] = [
  { key: "read", label: "Read", hint: "A Kindle note today", manual: false },
  { key: "meditate", label: "Meditate", hint: "Tap when done", manual: true },
  { key: "journal", label: "Journal", hint: "Wrote in today's journal", manual: false },
  { key: "fast", label: "Fast til noon", hint: "Tap when done", manual: true },
];

export type HabitsToday = Record<HabitKey, boolean>;

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export async function getHabitsToday(sql: Sql, date?: string): Promise<HabitsToday> {
  const today = date ?? dayKey(new Date());

  const [notes, journal, manualRows] = await Promise.all([
    sql`SELECT 1 FROM reading_notes WHERE note_date = ${today}::date LIMIT 1`,
    sql`SELECT 1 FROM daily_journal WHERE entry_date = ${today}::date AND length(trim(content)) > 0 LIMIT 1`,
    sql`SELECT meditated, fasted_til_noon FROM daily_habits WHERE habit_date = ${today}::date`,
  ]);

  const manual = manualRows[0];
  return {
    read: notes.length > 0,
    journal: journal.length > 0,
    meditate: Boolean(manual?.meditated),
    fast: Boolean(manual?.fasted_til_noon),
  };
}

/** Toggle one of the two manual habits. Read and journal aren't settable here — they follow their source table. */
export async function setHabit(sql: Sql, key: "meditate" | "fast", value: boolean, date?: string): Promise<void> {
  const today = date ?? dayKey(new Date());
  if (key === "meditate") {
    await sql`
      INSERT INTO daily_habits (habit_date, meditated) VALUES (${today}::date, ${value})
      ON CONFLICT (habit_date) DO UPDATE SET meditated = EXCLUDED.meditated, updated_at = NOW()
    `;
  } else {
    await sql`
      INSERT INTO daily_habits (habit_date, fasted_til_noon) VALUES (${today}::date, ${value})
      ON CONFLICT (habit_date) DO UPDATE SET fasted_til_noon = EXCLUDED.fasted_til_noon, updated_at = NOW()
    `;
  }
}

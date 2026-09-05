// Core habits — read / meditate / journal.
//
// "Fast til noon" was here until 2026-09-05; Berto asked for it to come off the
// top-of-fold card. The `fasted_til_noon` column in daily_habits is left in place
// (harmless, keeps old rows intact) but nothing reads or writes it any more.
//
// Deliberately separate from the scored 3-metric scorecard (lib/scorecard.ts):
// Berto's call (2026-09-03) was that the rings stay the only scored thing — this is
// a plain daily checklist underneath, worth nothing in points. Read and journal are
// derived from things he already logs elsewhere (Kindle notes via reading_notes, the
// daily journal page) so there's nothing new to tap for those two; meditation has no
// existing tracker, so it is a manual toggle in `daily_habits`.

import { dayKey } from "@/lib/streak";

/** Words per day that count as having journalled. The editor's counter imports this too. */
export const JOURNAL_WORD_GOAL = 250;

export type HabitKey = "read" | "meditate" | "journal";

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
  { key: "journal", label: "Journal", hint: "250 words in today's journal", manual: false },
];

export type HabitsToday = Record<HabitKey, boolean>;

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export async function getHabitsToday(sql: Sql, date?: string): Promise<HabitsToday> {
  const today = date ?? dayKey(new Date());

  const [notes, journal, manualRows] = await Promise.all([
    sql`SELECT 1 FROM reading_notes WHERE note_date = ${today}::date LIMIT 1`,
    // Same bar as the editor's word counter: 250 words. Counted in SQL so a long
    // entry never crosses the wire just to be measured.
    sql`SELECT 1 FROM daily_journal WHERE entry_date = ${today}::date
        AND array_length(regexp_split_to_array(trim(content), '\\s+'), 1) >= ${JOURNAL_WORD_GOAL} LIMIT 1`,
    sql`SELECT meditated FROM daily_habits WHERE habit_date = ${today}::date`,
  ]);

  const manual = manualRows[0];
  return {
    read: notes.length > 0,
    journal: journal.length > 0,
    meditate: Boolean(manual?.meditated),
  };
}

/** Toggle the one manual habit. Read and journal aren't settable here — they follow their source table. */
export async function setHabit(sql: Sql, key: "meditate", value: boolean, date?: string): Promise<void> {
  const today = date ?? dayKey(new Date());
  if (key !== "meditate") return;
  await sql`
    INSERT INTO daily_habits (habit_date, meditated) VALUES (${today}::date, ${value})
    ON CONFLICT (habit_date) DO UPDATE SET meditated = EXCLUDED.meditated, updated_at = NOW()
  `;
}

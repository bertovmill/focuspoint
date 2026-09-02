// Meditation, the one metric on the scorecard that the app itself produces.
//
// Steps and sleep come from the watch, keystrokes from the Mac agent, fasting and
// the journal from screens that already existed. Meditation had no source at all —
// so the timer (app/_components/meditation-timer.tsx) is both the tool and the
// sensor: you sit with it, and the sitting is what gets logged.
//
// Only *completed* time is ever written. The timer posts once, when a session ends
// or is stopped early, and never while it runs — a tab left open on a paused timer
// can't quietly earn credit. And minutes only ever accumulate upward within a day
// (`minutes + EXCLUDED.minutes`), because two sits are two sits.
//
// No db import at module scope — `sql` comes from the caller, same shape as
// lib/scorecard.ts.

import { dayKey } from "@/lib/streak";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export type MeditationDay = {
  /** YYYY-MM-DD in Berto's timezone. */
  date: string;
  minutes: number;
  sessions: number;
};

/** The presets the timer offers, in minutes. Berto's usual sit is the 20. */
export const MEDITATION_PRESETS = [5, 10, 20, 30, 45] as const;

/** Longest session the API will accept, in minutes. A day is not a meditation. */
export const MAX_SESSION_MINUTES = 240;

/**
 * Add a finished session to a day. Rounds to the nearest minute, and drops anything
 * under a minute on the floor: a timer started and stopped by accident is not a sit,
 * and letting 4-second sessions increment `sessions` would make that number a lie.
 */
export async function recordSession(
  sql: Sql,
  seconds: number,
  date?: string,
): Promise<MeditationDay> {
  const day = date ?? dayKey(new Date());
  const minutes = Math.min(MAX_SESSION_MINUTES, Math.round(seconds / 60));
  if (minutes < 1) return getDay(sql, day);

  const [row] = await sql`
    INSERT INTO meditation_days (logged_date, minutes, sessions)
    VALUES (${day}::date, ${minutes}, 1)
    ON CONFLICT (logged_date) DO UPDATE SET
      minutes    = meditation_days.minutes + EXCLUDED.minutes,
      sessions   = meditation_days.sessions + 1,
      updated_at = NOW()
    RETURNING to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
  `;
  return { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) };
}

/** One day's total. An unlogged day reads as a real zero here — the caller wants a number. */
export async function getDay(sql: Sql, date?: string): Promise<MeditationDay> {
  const day = date ?? dayKey(new Date());
  const [row] = await sql`
    SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
    FROM meditation_days
    WHERE logged_date = ${day}::date
  `;
  return row
    ? { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) }
    : { date: day, minutes: 0, sessions: 0 };
}

/**
 * Overwrite a day's total outright, for correcting a sit done away from the app.
 * Distinct from `recordSession`, which only ever adds — a correction that added
 * would be unable to fix an over-count.
 */
export async function setDay(sql: Sql, date: string, minutes: number): Promise<MeditationDay> {
  const clamped = Math.max(0, Math.min(MAX_SESSION_MINUTES, Math.round(minutes)));
  const [row] = await sql`
    INSERT INTO meditation_days (logged_date, minutes, sessions)
    VALUES (${date}::date, ${clamped}, ${clamped > 0 ? 1 : 0})
    ON CONFLICT (logged_date) DO UPDATE SET
      minutes    = EXCLUDED.minutes,
      sessions   = GREATEST(meditation_days.sessions, EXCLUDED.sessions),
      updated_at = NOW()
    RETURNING to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
  `;
  return { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) };
}

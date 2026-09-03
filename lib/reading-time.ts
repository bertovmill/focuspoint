// Reading time. Kindle exposes no session/minutes API — the timer in
// app/_components/reading-timer.tsx is both the tool and the sensor, same pattern
// as lib/meditation.ts. Only *completed* time is ever written, and minutes only
// accumulate upward within a day: two reading sessions are two sessions.
//
// No db import at module scope — `sql` comes from the caller, same shape as
// lib/meditation.ts and lib/scorecard.ts.

import { dayKey } from "@/lib/streak";

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export type ReadingDay = {
  /** YYYY-MM-DD in Berto's timezone. */
  date: string;
  minutes: number;
  sessions: number;
};

/** Longest session the API will accept, in minutes. */
export const MAX_READING_SESSION_MINUTES = 480;

/** Add a finished session to a day. Drops anything under a minute. */
export async function recordReadingSession(
  sql: Sql,
  seconds: number,
  date?: string,
): Promise<ReadingDay> {
  const day = date ?? dayKey(new Date());
  const minutes = Math.min(MAX_READING_SESSION_MINUTES, Math.round(seconds / 60));
  if (minutes < 1) return getReadingDay(sql, day);

  const [row] = await sql`
    INSERT INTO reading_days (logged_date, minutes, sessions)
    VALUES (${day}::date, ${minutes}, 1)
    ON CONFLICT (logged_date) DO UPDATE SET
      minutes    = reading_days.minutes + EXCLUDED.minutes,
      sessions   = reading_days.sessions + 1,
      updated_at = NOW()
    RETURNING to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
  `;
  return { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) };
}

/** One day's total. An unlogged day reads as a real zero. */
export async function getReadingDay(sql: Sql, date?: string): Promise<ReadingDay> {
  const day = date ?? dayKey(new Date());
  const [row] = await sql`
    SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
    FROM reading_days
    WHERE logged_date = ${day}::date
  `;
  return row
    ? { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) }
    : { date: day, minutes: 0, sessions: 0 };
}

/** Overwrite a day's total outright, for correcting a session logged away from the app. */
export async function setReadingDay(sql: Sql, date: string, minutes: number): Promise<ReadingDay> {
  const clamped = Math.max(0, Math.min(MAX_READING_SESSION_MINUTES, Math.round(minutes)));
  const [row] = await sql`
    INSERT INTO reading_days (logged_date, minutes, sessions)
    VALUES (${date}::date, ${clamped}, ${clamped > 0 ? 1 : 0})
    ON CONFLICT (logged_date) DO UPDATE SET
      minutes    = EXCLUDED.minutes,
      sessions   = GREATEST(reading_days.sessions, EXCLUDED.sessions),
      updated_at = NOW()
    RETURNING to_char(logged_date, 'YYYY-MM-DD') AS date, minutes, sessions
  `;
  return { date: String(row.date), minutes: Number(row.minutes), sessions: Number(row.sessions) };
}

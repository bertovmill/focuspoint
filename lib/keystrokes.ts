// Keystrokes per day — a WhatPulse-style "how much did I actually type today" number.
//
// The count is deliberately *only a count*: the local agent (keystroke-agent/) increments
// on every key press and never records which key, so nothing here — or in the database —
// can reconstruct what was typed. This is a volume metric, like steps for the hands.
//
// Where the number comes from:
//   - A launchd agent on Berto's Mac counts presses and POSTs the running daily total to
//     /api/keystrokes every minute, authenticated with KEYSTROKE_TOKEN. See the agent's
//     README for the privacy stance and setup.
//
// No db import at module scope — `sql` comes from the caller, the same shape as
// lib/scorecard.ts and lib/streak.ts, so client components can import the pure bits.

import { dayKey, STREAK_TIME_ZONE } from "@/lib/streak";
import { shiftDay } from "@/lib/scorecard";
import type { Bucket } from "@/lib/chart-buckets";

export { dayKey, STREAK_TIME_ZONE };

/** How many days the history strip draws. */
export const KEYSTROKE_DAYS = 14;

type Sql = (strings: TemplateStringsArray, ...values: unknown[]) => Promise<Record<string, unknown>[]>;

export type KeystrokeSummary = {
  /** YYYY-MM-DD in STREAK_TIME_ZONE. */
  today: string;
  /** Keystrokes counted so far today. */
  todayCount: number;
  /** Total over the last KEYSTROKE_DAYS days. */
  windowTotal: number;
  /** Mean per day over the days that actually have any count (never divides by idle days). */
  dailyAverage: number;
  /** Same mean, over the last 7 days rather than the full window. Includes today, which is
   *  partial until the day ends — the menu bar shows today's own count right above it, so
   *  the partiality is visible rather than hidden. */
  average7: number;
  /** The best single day ever recorded, *excluding today* so today always has a bar to
   *  beat — the same convention computeRecords() uses in lib/scorecard.ts. Null until
   *  there is a completed day with any count. */
  bestDay: { date: string; count: number } | null;
  /** Newest last: one bucket per day for the sparkline, labelled "Aug 29". */
  recent: Bucket[];
  /** Whether any day in the window has a count — the card nudges to set up the agent when not. */
  hasData: boolean;
};

/** "Aug 29" from a YYYY-MM-DD key, without dragging the value through a local timezone. */
function shortLabel(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export async function getKeystrokeSummary(sql: Sql): Promise<KeystrokeSummary> {
  const today = dayKey(new Date());
  const since = shiftDay(today, KEYSTROKE_DAYS - 1);

  const rows = await sql`
    SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, count
    FROM keystroke_days
    WHERE logged_date >= ${since}::date
  `;

  const byDate = new Map<string, number>();
  for (const r of rows as Record<string, unknown>[]) {
    byDate.set(String(r.date), Number(r.count));
  }

  const recent: Bucket[] = [];
  for (let i = KEYSTROKE_DAYS - 1; i >= 0; i--) {
    const key = shiftDay(today, i);
    recent.push({ label: shortLabel(key), value: byDate.get(key) ?? 0 });
  }

  const windowTotal = recent.reduce((s, b) => s + b.value, 0);
  const activeDays = recent.filter((b) => b.value > 0).length;

  // Last 7 days, averaged the same way as dailyAverage — over days that actually have a
  // count, so a weekend away doesn't halve the number.
  const last7 = recent.slice(-7);
  const total7 = last7.reduce((s, b) => s + b.value, 0);
  const active7 = last7.filter((b) => b.value > 0).length;

  // The all-time best completed day. Excludes today so the number stays a bar to beat
  // rather than a mirror of the count sitting right above it in the menu.
  const [best] = await sql`
    SELECT to_char(logged_date, 'YYYY-MM-DD') AS date, count
    FROM keystroke_days
    WHERE logged_date < ${today}::date AND count > 0
    ORDER BY count DESC, logged_date DESC
    LIMIT 1
  `;

  return {
    today,
    todayCount: byDate.get(today) ?? 0,
    windowTotal,
    dailyAverage: activeDays ? Math.round(windowTotal / activeDays) : 0,
    average7: active7 ? Math.round(total7 / active7) : 0,
    bestDay: best ? { date: String(best.date), count: Number(best.count) } : null,
    recent,
    hasData: windowTotal > 0,
  };
}

/**
 * Record the running daily total the agent reports. GREATEST keeps the number monotonic
 * within a day: if the agent restarts and loses its local tally it will POST a smaller
 * number for a while, and we must not let that erase progress already banked.
 */
export async function recordKeystrokes(sql: Sql, date: string, count: number): Promise<void> {
  await sql`
    INSERT INTO keystroke_days (logged_date, count)
    VALUES (${date}::date, ${count})
    ON CONFLICT (logged_date) DO UPDATE SET
      count = GREATEST(keystroke_days.count, EXCLUDED.count),
      updated_at = NOW()
  `;
}

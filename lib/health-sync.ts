// Pulling Google Health days into `daily_metrics`.
//
// Kept separate from lib/google-health.ts (which only knows how to talk to Google) so
// the card, the connect flow and the daily cron share one idea of what a sync is.

import { getDb } from "@/lib/db";
import { hasHealthScope } from "@/lib/google";
import { fetchHealthDay } from "@/lib/google-health";
import { dayKey, recordMetrics, shiftDay } from "@/lib/scorecard";

export type SyncResult = {
  connected: boolean;
  /** Days that came back with at least one number. */
  synced: number;
  days: { date: string; steps: number | null; sleepMinutes: number | null }[];
};

/**
 * Sync the last `days` days, today first.
 *
 * Today's numbers are still moving (he's walking), so re-syncing overwrites rather
 * than skipping. A day that returns nothing at all is left alone: writing nulls over
 * a good number would be worse than a stale one.
 */
export async function syncHealthRange(days = 3): Promise<SyncResult> {
  const sql = getDb();
  if (!(await hasHealthScope())) return { connected: false, synced: 0, days: [] };

  const today = dayKey(new Date());
  const out: SyncResult["days"] = [];

  for (let i = 0; i < days; i++) {
    const date = shiftDay(today, i);
    try {
      const day = await fetchHealthDay(date);
      if (day.steps === null && day.sleepMinutes === null) continue;
      await recordMetrics(sql, date, {
        ...(day.steps !== null ? { steps: day.steps } : {}),
        ...(day.sleepMinutes !== null ? { sleep_minutes: day.sleepMinutes } : {}),
      });
      out.push(day);
    } catch (err) {
      // One bad day shouldn't abort the backfill behind it.
      console.error(`Google Health sync failed for ${date}:`, err);
    }
  }

  return { connected: true, synced: out.length, days: out };
}

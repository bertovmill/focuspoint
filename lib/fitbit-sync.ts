// Pulling Fitbit days into `daily_metrics`.
//
// Kept separate from lib/fitbit.ts (which only knows how to talk to Fitbit) so the
// scorecard, the callback backfill and the cron all share one idea of what a sync is.

import { getDb } from "@/lib/db";
import { fetchFitbitDay, isFitbitConnected } from "@/lib/fitbit";
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
export async function syncFitbitRange(days = 3): Promise<SyncResult> {
  const sql = getDb();
  if (!(await isFitbitConnected(sql))) return { connected: false, synced: 0, days: [] };

  const today = dayKey(new Date());
  const out: SyncResult["days"] = [];

  for (let i = 0; i < days; i++) {
    const date = shiftDay(today, i);
    try {
      const day = await fetchFitbitDay(sql, date);
      if (day.steps === null && day.sleepMinutes === null) continue;
      await recordMetrics(sql, date, {
        ...(day.steps !== null ? { steps: day.steps } : {}),
        ...(day.sleepMinutes !== null ? { sleep_minutes: day.sleepMinutes } : {}),
      });
      out.push(day);
    } catch (err) {
      // One bad day shouldn't abort the backfill behind it.
      console.error(`Fitbit sync failed for ${date}:`, err);
    }
  }

  return { connected: true, synced: out.length, days: out };
}

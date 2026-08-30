// Pulling Readwise note counts into `daily_metrics`.

import { getDb } from "@/lib/db";
import { fetchNotesByDay, isReadwiseConfigured } from "@/lib/readwise";
import { dayKey, recordMetrics, shiftDay, STREAK_TIME_ZONE } from "@/lib/scorecard";

export type ReadwiseSyncResult = {
  configured: boolean;
  /** Days written, including the explicit zeroes. */
  synced: number;
  days: { date: string; notes: number }[];
};

/**
 * Sync note counts for the last `days` days.
 *
 * Days with no notes are written as an explicit **0**, not skipped. Readwise is
 * authoritative here — if it reports nothing for a day, none were written, and leaving
 * that day null would show an unlogged dash instead of an honest zero.
 */
export async function syncReadwise(days = 14): Promise<ReadwiseSyncResult> {
  if (!isReadwiseConfigured()) return { configured: false, synced: 0, days: [] };

  const byDay = await fetchNotesByDay(days, STREAK_TIME_ZONE);
  const sql = getDb();
  const today = dayKey(new Date());
  const out: ReadwiseSyncResult["days"] = [];

  for (let i = 0; i < days; i++) {
    const date = shiftDay(today, i);
    const notes = byDay.get(date) ?? 0;
    await recordMetrics(sql, date, { readwise_notes: notes });
    out.push({ date, notes });
  }
  return { configured: true, synced: out.length, days: out };
}

// Pulling the Wealthsimple balance into `daily_metrics`.
//
// Kept separate from lib/wealthsimple.ts (which only knows how to talk to
// Wealthsimple) so the card, the cron and the API route share one idea of a sync.

import { getDb } from "@/lib/db";
import { dayKey, recordMetrics } from "@/lib/scorecard";
import { fetchPortfolioValue, isWealthsimpleConnected } from "@/lib/wealthsimple";

export type PortfolioSyncResult = {
  connected: boolean;
  /** Null when connected but the value couldn't be read. */
  amount: number | null;
  currency?: string;
};

/**
 * Record today's portfolio value.
 *
 * Only today: unlike steps, this is a level with no history to backfill — whatever it
 * is right now is the answer, and yesterday's number is already stored.
 */
export async function syncPortfolio(): Promise<PortfolioSyncResult> {
  if (!(await isWealthsimpleConnected())) return { connected: false, amount: null };

  const value = await fetchPortfolioValue();
  if (!value) return { connected: true, amount: null };

  await recordMetrics(getDb(), dayKey(new Date()), { portfolio: value.amount });
  return { connected: true, amount: value.amount, currency: value.currency };
}

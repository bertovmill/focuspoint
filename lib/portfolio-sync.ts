// Pulling the portfolio value into `daily_metrics`.
//
// Kept separate from lib/snaptrade.ts (which only knows how to talk to SnapTrade) so
// the card, the cron and the API route share one idea of what a sync is.

import { fetchPortfolioValue, isPortfolioConnected, recordPortfolio } from "@/lib/snaptrade";

export type PortfolioSyncResult = {
  connected: boolean;
  /** Null when connected but no value could be read. */
  amount: number | null;
  currency?: string;
  /** Which accounts made up the total — the number is meaningless without this. */
  accounts?: { name: string; amount: number }[];
};

/**
 * Record today's invested value.
 *
 * Today only: unlike steps, this is a level with no history to backfill — whatever it
 * is now is the answer, and previous days are already stored.
 */
export async function syncPortfolio(): Promise<PortfolioSyncResult> {
  if (!(await isPortfolioConnected())) return { connected: false, amount: null };

  const value = await fetchPortfolioValue();
  if (!value) return { connected: true, amount: null };

  await recordPortfolio(value.amount);
  return {
    connected: true,
    amount: value.amount,
    currency: value.currency,
    accounts: value.accounts.map((a) => ({ name: a.name, amount: a.amount })),
  };
}

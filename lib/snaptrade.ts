// SnapTrade — the portfolio number on the daily scorecard.
//
// Wealthsimple publishes no developer API, so the portfolio row needs an aggregator.
// The first attempt drove Wealthsimple's own GraphQL backend with Berto's password and
// 2FA code; he called it "a bit sketch" and he was right (removed in 4d8ce55).
//
// SnapTrade is the sanctioned route: free self-serve tier, an official Wealthsimple
// integration, and — the part that matters — **his credentials never reach this app**.
// He authorises on Wealthsimple's own page; we hold an API key that reads balances.
//
// Worth being straight about one thing: SnapTrade's own connection to Wealthsimple is
// itself an `UNOFFICIAL_API` (their `authorization_types` say so). So the underlying
// fragility didn't vanish — it moved to a company that maintains it for a living. What
// genuinely changed is who handles the password, and that nothing here can trade.
//
// The **personal** API key reads the accounts already connected in his SnapTrade
// dashboard. There is no user registration: `listSnapTradeUsers` 403s on a personal
// key, and none of it is needed.

import { getDb } from "@/lib/db";

/**
 * Account types that are **not** the portfolio.
 *
 * Berto's answer when asked what this row should mean was "just investments". His cash
 * account alone holds ~$8k, which would silently pad the number by a third. Matched as
 * substrings because Wealthsimple's types are things like `ca_cash_msb` and
 * `ca_credit_card`.
 *
 * An unrecognised type counts as an investment: a missing account is invisible in the
 * total, whereas a chequing balance quietly inflating it is the worse failure.
 */
const NON_INVESTMENT_TYPES = ["cash", "credit_card", "line_of_credit"];

export type PortfolioValue = {
  amount: number;
  currency: string;
  /** What was counted, for the debug route — one line per included account. */
  accounts: { name: string; type: string; amount: number; currency: string }[];
  /** Excluded, and why, so a surprising total can be explained without guessing. */
  excluded: { name: string; type: string; reason: string }[];
};

function configured(): boolean {
  return Boolean(process.env.SNAPTRADE_CLIENT_ID && process.env.SNAPTRADE_CONSUMER_KEY);
}

export function isSnaptradeConfigured(): boolean {
  return configured();
}

/** Whether a brokerage is actually connected — configured keys alone prove nothing. */
export async function isPortfolioConnected(): Promise<boolean> {
  if (!configured()) return false;
  try {
    const client = await snaptrade();
    const { data } = await client.connections.listBrokerageAuthorizations({});
    return Array.isArray(data) && data.length > 0;
  } catch {
    return false;
  }
}

/**
 * The SDK is imported lazily.
 *
 * It pulls in axios and the whole generated client; the scorecard is on the home
 * screen and most requests never touch this path.
 */
async function snaptrade() {
  const { Snaptrade, SnaptradeAuth } = await import("snaptrade-typescript-sdk");
  return new Snaptrade({
    auth: SnaptradeAuth.personalApiKey({
      clientId: process.env.SNAPTRADE_CLIENT_ID!,
      consumerKey: process.env.SNAPTRADE_CONSUMER_KEY!,
    }),
  });
}

type Account = {
  name?: string | null;
  meta?: { type?: string; status?: string } | null;
  balance?: { total?: { amount?: number | null; currency?: string | null } | null } | null;
};

/**
 * Current invested value across every open investment account.
 *
 * Closed accounts are skipped even at a zero balance — they're noise in the breakdown,
 * and a closed account with a stale non-zero balance would be worse than noise.
 */
export async function fetchPortfolioValue(): Promise<PortfolioValue | null> {
  if (!configured()) return null;

  const client = await snaptrade();
  const { data } = await client.accountInformation.listUserAccounts({});
  if (!Array.isArray(data)) return null;

  const accounts: PortfolioValue["accounts"] = [];
  const excluded: PortfolioValue["excluded"] = [];

  for (const raw of data as Account[]) {
    const name = raw.name ?? "unnamed";
    const type = (raw.meta?.type ?? "").toLowerCase();
    const status = (raw.meta?.status ?? "").toLowerCase();

    if (status && status !== "open") {
      excluded.push({ name, type, reason: `status ${status}` });
      continue;
    }
    if (NON_INVESTMENT_TYPES.some((t) => type.includes(t))) {
      excluded.push({ name, type, reason: "not an investment account" });
      continue;
    }
    const amount = Number(raw.balance?.total?.amount);
    if (!Number.isFinite(amount)) {
      excluded.push({ name, type, reason: "no balance reported" });
      continue;
    }
    accounts.push({ name, type, amount, currency: raw.balance?.total?.currency ?? "CAD" });
  }

  if (!accounts.length) return null;

  // Every account is CAD today. Summing across currencies would be wrong, so anything
  // that isn't the majority currency is left out of the total rather than silently
  // added at 1:1 — a wrong number here is worse than an incomplete one.
  const currency = accounts[0].currency;
  const mismatched = accounts.filter((a) => a.currency !== currency);
  for (const a of mismatched) {
    excluded.push({ name: a.name, type: a.type, reason: `currency ${a.currency}, not ${currency}` });
  }
  const counted = accounts.filter((a) => a.currency === currency);
  const amount = counted.reduce((sum, a) => sum + a.amount, 0);

  return { amount: Math.round(amount * 100) / 100, currency, accounts: counted, excluded };
}

/** Where the connection portal sends him to authorise a brokerage. */
export async function connectionPortalUrl(redirectTo?: string): Promise<string | null> {
  if (!configured()) return null;
  const client = await snaptrade();
  const { data } = await client.authentication.loginSnapTradeUser({
    ...(redirectTo ? { customRedirect: redirectTo } : {}),
  } as never);
  const url = (data as { redirectURI?: string })?.redirectURI;
  return url ?? null;
}

/** Record today's value, so the scorecard has it without a live call. */
export async function recordPortfolio(amount: number): Promise<void> {
  const { dayKey, recordMetrics } = await import("@/lib/scorecard");
  await recordMetrics(getDb(), dayKey(new Date()), { portfolio: amount });
}

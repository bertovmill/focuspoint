// X limits and pay-per-use prices shared by the server (lib/x-api.ts) and the
// Writing page's tweet composer. Kept free of server imports so the client can use it.

export const TWEET_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const TWEET_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const TWEET_MAX_IMAGES = 4;

// Prices in USD, from docs.x.com/x-api/getting-started/pricing.
export const X_POST_COST = 0.015;
/** A post with a link in it costs far more than a plain one. */
export const X_POST_WITH_LINK_COST = 0.2;

/** Reading a tweet (e.g. to refresh its stats) is billed per tweet returned. */
export const X_POST_READ_COST = 0.005;

// A tweet gets nearly all its reach in its first few days, so its stats are read
// at most twice on a schedule (lib/tweets.ts `listTweetIdsForStats`): once
// STATS_FIRST_DAYS after posting, once STATS_FINAL_DAYS after. A read taken after
// STATS_FINAL_DAYS freezes them — about $0.01 of X credit per tweet, ever.
export const STATS_FIRST_DAYS = 2;
export const STATS_FINAL_DAYS = 7;

/** True once a tweet's stored stats were read STATS_FINAL_DAYS or more after it was posted. */
export function statsFinal(t: { createdAt: string; metricsAt: string | null }): boolean {
  return (
    t.metricsAt !== null &&
    new Date(t.metricsAt).getTime() - new Date(t.createdAt).getTime() >= STATS_FINAL_DAYS * 86_400_000
  );
}
/** Most tweet ids one lookup request takes. */
export const X_LOOKUP_MAX_IDS = 100;

export function hasLink(text: string): boolean {
  return /https?:\/\/\S+/.test(text);
}

export function estimateTweetCost(text: string): number {
  return hasLink(text) ? X_POST_WITH_LINK_COST : X_POST_COST;
}

export function formatUsd(n: number): string {
  return n < 1 ? `$${n.toFixed(3).replace(/0$/, "")}` : `$${n.toFixed(2)}`;
}

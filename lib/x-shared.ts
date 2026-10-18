// X limits and pay-per-use prices shared by the server (lib/x-api.ts) and the
// Writing page's tweet composer. Kept free of server imports so the client can use it.

export const TWEET_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const TWEET_IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const TWEET_MAX_IMAGES = 4;

// Prices in USD, from docs.x.com/x-api/getting-started/pricing.
export const X_POST_COST = 0.015;
/** A post with a link in it costs far more than a plain one. */
export const X_POST_WITH_LINK_COST = 0.2;

export function hasLink(text: string): boolean {
  return /https?:\/\/\S+/.test(text);
}

export function estimateTweetCost(text: string): number {
  return hasLink(text) ? X_POST_WITH_LINK_COST : X_POST_COST;
}

export function formatUsd(n: number): string {
  return n < 1 ? `$${n.toFixed(3).replace(/0$/, "")}` : `$${n.toFixed(2)}`;
}

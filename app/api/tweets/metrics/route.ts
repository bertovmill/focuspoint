import { NextResponse } from "next/server";
import { listTweets } from "@/lib/tweets";
import { refreshTweetStats } from "@/lib/x-api";

/**
 * POST — pull fresh likes/impressions/etc. from X for every tweet whose stats
 * aren't final yet, and return the updated list. Spends X credit per tweet, so
 * the page only calls it from the Refresh stats button.
 */
export async function POST() {
  try {
    const { refreshed, cost } = await refreshTweetStats("unfrozen");
    return NextResponse.json({ refreshed, cost, tweets: await listTweets() });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't refresh tweet stats" }, { status: 502 });
  }
}

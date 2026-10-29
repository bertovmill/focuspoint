import { defineTool } from "eve/tools";
import { z } from "zod";
import { listTweets } from "../../../../lib/tweets";
import { refreshTweetStats } from "../../../../lib/x-api";
import { formatUsd, X_POST_READ_COST } from "../../../../lib/x-shared";

export default defineTool({
  description: `How Berto's tweets are doing on X: impressions, likes, reposts, replies, quotes and bookmarks for every tweet Cael has posted (the Writing page's Tweets tab; tweets written on X itself aren't included). Use it when he asks how his tweets or posts on X performed, which one did best, or what's resonating, and when drafting new tweets to learn from what landed. Stats are stored from the last refresh (see stats_as_of). Pass refresh: true only when he asks for fresh numbers or none are stored yet: it reads every tweet from X, about ${formatUsd(X_POST_READ_COST)} of X credit per tweet.`,
  inputSchema: z.object({
    refresh: z.boolean().optional().describe("Pull current numbers from X first (spends X credit)."),
    sort: z.enum(["recent", "top"]).optional().describe("'recent' (default) newest first, or 'top' by impressions."),
    limit: z.number().int().min(1).max(100).optional().describe("How many tweets to return (default 20)."),
  }),
  async execute({ refresh = false, sort = "recent", limit = 20 }) {
    try {
      const refreshed = refresh ? await refreshTweetStats() : null;
      const tweets = await listTweets();
      const ordered =
        sort === "top"
          ? [...tweets].sort((a, b) => (b.metrics?.impressions ?? -1) - (a.metrics?.impressions ?? -1))
          : tweets;
      const withStats = tweets.filter((t) => t.metrics);
      const total = (key: "impressions" | "likes") => withStats.reduce((n, t) => n + (t.metrics?.[key] ?? 0), 0);
      return {
        success: true as const,
        refreshed: refreshed ? { tweets: refreshed.refreshed, cost: formatUsd(refreshed.cost) } : null,
        stats_as_of: withStats.map((t) => t.metricsAt!).sort().at(-1) ?? null,
        totals: { tweets: tweets.length, with_stats: withStats.length, impressions: total("impressions"), likes: total("likes") },
        tweets: ordered.slice(0, limit).map((t) => ({
          text: t.text,
          posted_at: t.createdAt,
          url: t.url,
          ...(t.metrics ?? {}),
        })),
      };
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text", value: `Couldn't get tweet stats: ${output.error}` };
    if (output.totals.tweets === 0) return { type: "text", value: "No tweets from Cael yet." };
    const head = [
      output.refreshed ? `Refreshed ${output.refreshed.tweets} tweets from X (about ${output.refreshed.cost}).` : null,
      output.stats_as_of
        ? `Stats as of ${output.stats_as_of}. ${output.totals.with_stats}/${output.totals.tweets} tweets have stats: ${output.totals.impressions} impressions, ${output.totals.likes} likes in total.`
        : "No stats stored yet: call again with refresh: true (after checking with Berto, it costs X credit).",
    ]
      .filter(Boolean)
      .join(" ");
    const lines = output.tweets.map((t) => {
      const stats =
        "impressions" in t
          ? `${t.impressions} views, ${t.likes} likes, ${t.reposts} reposts, ${t.replies} replies, ${t.quotes} quotes, ${t.bookmarks} bookmarks`
          : "no stats";
      return `- [${t.posted_at.slice(0, 10)}] ${stats}: "${t.text.replace(/\s+/g, " ").slice(0, 140)}" ${t.url}`;
    });
    return { type: "text", value: [head, ...lines].join("\n") };
  },
});

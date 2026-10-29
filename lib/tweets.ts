import { ensureSchema, getDb } from "./db";
import { STATS_FINAL_DAYS, STATS_FIRST_DAYS } from "./x-shared";

/** A tweet Cael posted to X (lib/x-api.ts saves every one). */
export interface Tweet {
  id: number;
  tweetId: string;
  text: string;
  url: string;
  /** The article it shared, when tweeted from a post in the editor. */
  postId: number | null;
  postTitle: string | null;
  createdAt: string;
  /** X's counts as of `metricsAt`; null until stats are first refreshed. */
  metrics: TweetMetrics | null;
  metricsAt: string | null;
}

export interface TweetMetrics {
  impressions: number;
  likes: number;
  reposts: number;
  replies: number;
  quotes: number;
  bookmarks: number;
}

function toTweet(row: Record<string, unknown>): Tweet {
  return {
    id: Number(row.id),
    tweetId: String(row.tweet_id),
    text: String(row.text),
    url: String(row.url),
    postId: row.post_id == null ? null : Number(row.post_id),
    postTitle: (row.post_title as string | null) ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at),
    metrics:
      row.metrics_at == null
        ? null
        : {
            impressions: Number(row.impressions ?? 0),
            likes: Number(row.likes ?? 0),
            reposts: Number(row.reposts ?? 0),
            replies: Number(row.replies ?? 0),
            quotes: Number(row.quotes ?? 0),
            bookmarks: Number(row.bookmarks ?? 0),
          },
    metricsAt:
      row.metrics_at == null
        ? null
        : row.metrics_at instanceof Date
          ? row.metrics_at.toISOString()
          : String(row.metrics_at),
  };
}

export async function recordTweet(t: { tweetId: string; text: string; url: string; postId?: number }): Promise<void> {
  await getDb()`
    INSERT INTO tweets (tweet_id, text, url, post_id)
    VALUES (${t.tweetId}, ${t.text}, ${t.url}, ${t.postId ?? null})
    ON CONFLICT (tweet_id) DO NOTHING
  `;
}

/** Newest first. */
export async function listTweets(limit = 100): Promise<Tweet[]> {
  await ensureSchema();
  const rows = await getDb()`
    SELECT t.*, p.title AS post_title
    FROM tweets t LEFT JOIN posts p ON p.id = t.post_id
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toTweet);
}

/**
 * X ids of the tweets whose stats should be read. `unfrozen`: every tweet whose
 * stats aren't final yet (the Refresh button). `due`: only those whose next
 * scheduled snapshot has come up (the daily cron) — the first STATS_FIRST_DAYS
 * after posting, the final one STATS_FINAL_DAYS after; older tweets with no
 * stats yet get their one final read.
 */
export async function listTweetIdsForStats(which: "due" | "unfrozen"): Promise<string[]> {
  await ensureSchema();
  const first = `${STATS_FIRST_DAYS} days`;
  const final = `${STATS_FINAL_DAYS} days`;
  const rows =
    which === "unfrozen"
      ? await getDb()`
          SELECT tweet_id FROM tweets
          WHERE metrics_at IS NULL OR metrics_at < created_at + ${final}::interval
        `
      : await getDb()`
          SELECT tweet_id FROM tweets
          WHERE (metrics_at IS NULL OR metrics_at < created_at + ${final}::interval)
            AND (
              created_at <= NOW() - ${final}::interval
              OR (created_at <= NOW() - ${first}::interval
                  AND (metrics_at IS NULL OR metrics_at < created_at + ${first}::interval))
            )
        `;
  return rows.map((r) => String(r.tweet_id));
}

/** Store fresh counts from X (lib/x-api.ts `fetchTweetMetrics`), keyed by X's tweet id. */
export async function saveTweetMetrics(metrics: Map<string, TweetMetrics>): Promise<void> {
  if (metrics.size === 0) return;
  await ensureSchema();
  const ids = [...metrics.keys()];
  const col = (k: keyof TweetMetrics) => ids.map((id) => metrics.get(id)![k]);
  await getDb()`
    UPDATE tweets t SET
      impressions = m.impressions, likes = m.likes, reposts = m.reposts,
      replies = m.replies, quotes = m.quotes, bookmarks = m.bookmarks,
      metrics_at = NOW()
    FROM unnest(
      ${ids}::text[], ${col("impressions")}::int[], ${col("likes")}::int[], ${col("reposts")}::int[],
      ${col("replies")}::int[], ${col("quotes")}::int[], ${col("bookmarks")}::int[]
    ) AS m(tweet_id, impressions, likes, reposts, replies, quotes, bookmarks)
    WHERE t.tweet_id = m.tweet_id
  `;
}

/** A tweet saved from the Tweets tab to post later (text only). */
export interface TweetDraft {
  id: number;
  text: string;
  updatedAt: string;
}

function toDraft(row: Record<string, unknown>): TweetDraft {
  return {
    id: Number(row.id),
    text: String(row.text),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  };
}

/** Most recently edited first. */
export async function listTweetDrafts(): Promise<TweetDraft[]> {
  await ensureSchema();
  const rows = await getDb()`SELECT * FROM tweet_drafts ORDER BY updated_at DESC`;
  return rows.map(toDraft);
}

/** Creates a draft, or updates draft `id` when given. Null when `id` doesn't exist. */
export async function saveTweetDraft(text: string, id?: number): Promise<TweetDraft | null> {
  await ensureSchema();
  const rows = id
    ? await getDb()`UPDATE tweet_drafts SET text = ${text}, updated_at = NOW() WHERE id = ${id} RETURNING *`
    : await getDb()`INSERT INTO tweet_drafts (text) VALUES (${text}) RETURNING *`;
  return rows[0] ? toDraft(rows[0]) : null;
}

export async function deleteTweetDraft(id: number): Promise<void> {
  await getDb()`DELETE FROM tweet_drafts WHERE id = ${id}`;
}

/** A tweet queued to post at `scheduledAt` (workflows/scheduled-tweet.ts posts it). */
export interface ScheduledTweet {
  id: number;
  text: string;
  /** Public URLs of the attached images, from the `media` table. */
  imageUrls: string[];
  scheduledAt: string;
  status: "scheduled" | "posting" | "posted" | "failed" | "cancelled";
  tweetUrl: string | null;
  error: string | null;
}

function toScheduled(row: Record<string, unknown>): ScheduledTweet {
  const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v));
  return {
    id: Number(row.id),
    text: String(row.text),
    imageUrls: ((row.media_keys as string[] | null) ?? []).map(
      (k) => `/media/${k.split("/").map(encodeURIComponent).join("/")}`,
    ),
    scheduledAt: iso(row.scheduled_at),
    status: row.status as ScheduledTweet["status"],
    tweetUrl: (row.tweet_url as string | null) ?? null,
    error: (row.error as string | null) ?? null,
  };
}

/** Queued and failed tweets, soonest first. Posted ones show in `listTweets`. */
export async function listScheduledTweets(): Promise<ScheduledTweet[]> {
  await ensureSchema();
  const rows = await getDb()`
    SELECT * FROM scheduled_tweets
    WHERE status IN ('scheduled', 'posting', 'failed')
    ORDER BY scheduled_at ASC
  `;
  return rows.map(toScheduled);
}

export async function createScheduledTweet(t: { text: string; mediaKeys: string[]; scheduledAt: Date }): Promise<ScheduledTweet> {
  await ensureSchema();
  const rows = await getDb()`
    INSERT INTO scheduled_tweets (text, media_keys, scheduled_at)
    VALUES (${t.text}, ${t.mediaKeys}, ${t.scheduledAt.toISOString()})
    RETURNING *
  `;
  return toScheduled(rows[0]);
}

/** Cancel a queued tweet (or dismiss a failed one). Its workflow wakes, finds it cancelled, and stops. */
export async function cancelScheduledTweet(id: number): Promise<boolean> {
  const rows = await getDb()`
    UPDATE scheduled_tweets SET status = 'cancelled'
    WHERE id = ${id} AND status IN ('scheduled', 'failed')
    RETURNING id
  `;
  return rows.length > 0;
}

/**
 * Claim a due tweet for posting. Returns null when it was cancelled meanwhile,
 * or already claimed, so a retried step can never post it twice.
 */
export async function claimScheduledTweet(id: number): Promise<{ text: string; mediaKeys: string[] } | null> {
  const rows = await getDb()`
    UPDATE scheduled_tweets SET status = 'posting'
    WHERE id = ${id} AND status = 'scheduled'
    RETURNING text, media_keys
  `;
  return rows[0] ? { text: String(rows[0].text), mediaKeys: (rows[0].media_keys as string[]) ?? [] } : null;
}

export async function finishScheduledTweet(id: number, result: { tweetUrl: string } | { error: string }): Promise<void> {
  if ("tweetUrl" in result) {
    await getDb()`UPDATE scheduled_tweets SET status = 'posted', tweet_url = ${result.tweetUrl}, error = NULL WHERE id = ${id}`;
  } else {
    await getDb()`UPDATE scheduled_tweets SET status = 'failed', error = ${result.error} WHERE id = ${id}`;
  }
}

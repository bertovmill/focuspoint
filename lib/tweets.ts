import { getDb } from "./db";

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
  const rows = await getDb()`
    SELECT t.*, p.title AS post_title
    FROM tweets t LEFT JOIN posts p ON p.id = t.post_id
    ORDER BY t.created_at DESC
    LIMIT ${limit}
  `;
  return rows.map(toTweet);
}

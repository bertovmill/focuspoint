import "server-only";
import { listContent, type ContentEntry } from "./content";
import { listMediumPosts } from "./medium";
import { listPublishedPosts } from "./posts";
import { listSubstackPosts } from "./substack";
import { getDb } from "./db";

/**
 * The three newest things for the homepage "Latest" cards: an article (from
 * this site, Substack or Medium, whichever is newest), a podcast episode with
 * its Spotify cover, and the last tweet Cael posted with the photo it carried.
 */

export interface LatestWriting {
  title: string;
  href: string;
  date: string;
  summary: string;
  coverUrl: string | null;
  external: boolean;
}

export interface LatestPodcast {
  title: string;
  href: string;
  date: string;
  summary: string;
  duration?: string;
  coverUrl: string | null;
}

export interface LatestTweet {
  text: string;
  url: string;
  date: string;
  imageUrl: string | null;
}

export function sameTitle(a: string, b: string): boolean {
  const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  return norm(a) === norm(b);
}

/** A post with no cover shows its first inline image (the hand-drawn sketches) instead. */
function firstBodyImage(body: string): string | null {
  const m = body.match(/!\[[^\]]*\]\(([^)\s]+)[^)]*\)/) ?? body.match(/<img[^>]+src="([^"]+)"/);
  return m ? m[1] : null;
}

/** Every article across the three homes, newest first, cross-posts shown once. */
export async function listAllWriting(): Promise<LatestWriting[]> {
  const [own, substack, medium] = await Promise.all([
    listPublishedPosts(),
    listSubstackPosts(),
    listMediumPosts(),
  ]);
  return [
    ...own.map((p) => ({
      title: p.title,
      href: `/writing/${p.slug}`,
      date: p.publishedAt ?? "",
      summary: p.summary,
      coverUrl: p.coverUrl ?? firstBodyImage(p.body),
      external: false,
    })),
    ...substack.map((p) => ({
      title: p.title,
      href: p.url,
      date: p.date,
      summary: p.summary,
      coverUrl: null,
      external: true,
    })),
    ...medium.map((p) => ({
      title: p.title,
      href: p.url,
      date: p.date,
      summary: p.summary,
      coverUrl: p.coverUrl,
      external: true,
    })),
  ]
    .filter((post, i, all) => all.findIndex((o) => sameTitle(o.title, post.title)) === i)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Spotify's public oEmbed gives the episode cover with no credentials. */
async function spotifyCover(episodeId: string): Promise<string | null> {
  try {
    const target = `https://open.spotify.com/episode/${episodeId}`;
    const res = await fetch(`https://open.spotify.com/oembed?url=${encodeURIComponent(target)}`, {
      next: { revalidate: 86400 },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { thumbnail_url?: string };
    return typeof data.thumbnail_url === "string" ? data.thumbnail_url : null;
  } catch {
    return null;
  }
}

export async function latestPodcast(): Promise<LatestPodcast | null> {
  const [episode]: ContentEntry[] = await listContent("podcast");
  if (!episode) return null;
  return {
    title: episode.title,
    href: `/podcast/${episode.slug}`,
    date: episode.date,
    summary: episode.summary ?? "",
    duration: episode.duration,
    coverUrl: episode.image ?? (episode.spotify ? await spotifyCover(episode.spotify) : null),
  };
}

/**
 * The newest tweet Cael posted. Its photo comes from the scheduled tweet it was
 * posted from (media_keys), or failing that the cover of the article it shared.
 */
export async function latestTweet(): Promise<LatestTweet | null> {
  try {
    const rows = await getDb()`
      SELECT t.text, t.url, t.created_at, p.cover_url,
             (SELECT s.media_keys FROM scheduled_tweets s
               WHERE s.tweet_url = t.url AND s.status = 'posted' LIMIT 1) AS media_keys
      FROM tweets t LEFT JOIN posts p ON p.id = t.post_id
      ORDER BY t.created_at DESC
      LIMIT 1
    `;
    const row = rows[0];
    if (!row) return null;
    const keys = (row.media_keys as string[] | null) ?? [];
    const imageUrl = keys[0]
      ? `/media/${keys[0].split("/").map(encodeURIComponent).join("/")}`
      : ((row.cover_url as string | null) ?? null);
    const created = row.created_at instanceof Date ? row.created_at : new Date(String(row.created_at));
    return {
      text: String(row.text),
      url: String(row.url),
      date: created.toISOString().slice(0, 10),
      imageUrl,
    };
  } catch (error) {
    console.error("Latest tweet unavailable:", error);
    return null;
  }
}

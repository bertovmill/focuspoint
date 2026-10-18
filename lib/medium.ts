import "server-only";

/**
 * Berto's Medium posts, for the writing index next to Substack and his own
 * articles. Like Substack, the public RSS feed is the source of truth: nothing
 * is copied into the repo, and a new post shows up within an hour.
 *
 * Medium's feed only carries the 10 most recent posts, so older ones drop off
 * the index as new ones come in. The cover is the first image in each post's
 * body (Medium's feed has no separate cover field).
 */
export const MEDIUM_URL = "https://medium.com/@bertomill";
const FEED_URL = "https://medium.com/feed/@bertomill";

export interface MediumPost {
  title: string;
  /** Canonical post URL on Medium, without the `?source=rss` tracking suffix. */
  url: string;
  /** ISO date (YYYY-MM-DD), matching the shape `formatDate` in lib/content expects. */
  date: string;
  /** The post's opening, as plain text, since the feed has no description. */
  summary: string;
  /** The first image in the post, at thumbnail width, or null if it has none. */
  coverUrl: string | null;
  /** Rough read time in minutes, at 220 words/minute, from the full post body. */
  readingMinutes: number;
}

const tag = (xml: string, name: string): string => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : "";
};

/** Strip a CDATA wrapper and decode the entities Medium's feed uses. */
function unwrap(value: string): string {
  return decode(value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1")).trim();
}

function decode(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function toDateString(rfc822: string): string {
  const d = new Date(rfc822);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** The first paragraph that reads like prose (skipping captions and one-liners), cut to ~200 characters. */
function summaryOf(html: string): string {
  for (const m of html.matchAll(/<p>([\s\S]*?)<\/p>/g)) {
    const text = decode(m[1].replace(/<[^>]+>/g, "")).replace(/\s+/g, " ").trim();
    if (text.length < 60) continue;
    if (text.length <= 200) return text;
    return `${text.slice(0, 200).replace(/\s+\S*$/, "")}…`;
  }
  return "";
}

function parseItem(xml: string): MediumPost | null {
  const title = tag(xml, "title");
  const link = tag(xml, "link");
  if (!title || !link) return null;
  const html = tag(xml, "content:encoded");
  const img = html.match(/<img[^>]+src="([^"]+)"/)?.[1] ?? null;
  const words = html.replace(/<[^>]+>/g, " ").split(/\s+/).filter(Boolean).length;
  return {
    title,
    url: link.replace(/\?source=rss[^#]*$/, ""),
    date: toDateString(tag(xml, "pubDate")),
    summary: summaryOf(html),
    // Medium serves any width from the same path; 480 is plenty for a thumbnail.
    coverUrl: img ? img.replace(/\/max\/\d+\//, "/max/480/") : null,
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/** The latest Medium posts, newest first. An unreachable feed is an empty list, not an error page. */
export async function listMediumPosts(): Promise<MediumPost[]> {
  try {
    const res = await fetch(FEED_URL, {
      next: { revalidate: 3600 },
      // Medium turns away requests without a browser-ish user agent.
      headers: { "user-agent": "Mozilla/5.0 (compatible; bertomill.com)" },
    });
    if (!res.ok) return [];
    const xml = await res.text();
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)]
      .map((m) => parseItem(m[1]))
      .filter((p): p is MediumPost => p !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Medium feed unavailable:", error);
    return [];
  }
}

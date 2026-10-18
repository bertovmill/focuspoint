import "server-only";

/**
 * Writing for bertomill.com now lives on Substack. The public RSS feed is the
 * source of truth: nothing is copied into the repo, and a new post shows up here
 * within an hour of publishing without a deploy.
 *
 * If the publication is ever renamed in Substack settings, update SUBSTACK_URL.
 */
export const SUBSTACK_URL = "https://robertmillwriting.substack.com";
const FEED_URL = `${SUBSTACK_URL}/feed`;

export interface SubstackPost {
  title: string;
  /** Canonical post URL on Substack. */
  url: string;
  /** ISO date (YYYY-MM-DD), matching the shape `formatDate` in lib/content expects. */
  date: string;
  summary: string;
  tags: string[];
  /** Rough read time in minutes, at 220 words/minute, from the full post body. */
  readingMinutes: number;
}

const tag = (xml: string, name: string): string => {
  const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`));
  return m ? unwrap(m[1]) : "";
};

const tags = (xml: string, name: string): string[] =>
  [...xml.matchAll(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)</${name}>`, "g"))].map((m) =>
    unwrap(m[1]),
  );

/** Strip a CDATA wrapper and decode the handful of entities RSS titles use. */
function unwrap(value: string): string {
  const inner = value.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return inner
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

function toDateString(rfc822: string): string {
  const d = new Date(rfc822);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

function parseItem(xml: string): SubstackPost | null {
  const title = tag(xml, "title");
  const url = tag(xml, "link");
  if (!title || !url) return null;
  const body = tag(xml, "content:encoded").replace(/<[^>]+>/g, " ");
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    title,
    url,
    date: toDateString(tag(xml, "pubDate")),
    summary: tag(xml, "description"),
    tags: tags(xml, "category"),
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/** Every published Substack post, newest first. An unreachable feed is an empty list, not an error page. */
export async function listSubstackPosts(): Promise<SubstackPost[]> {
  try {
    const res = await fetch(FEED_URL, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const xml = await res.text();
    const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map((m) => m[1]);
    return items
      .map(parseItem)
      .filter((p): p is SubstackPost => p !== null)
      .sort((a, b) => b.date.localeCompare(a.date));
  } catch (error) {
    console.error("Substack feed unavailable:", error);
    return [];
  }
}

import "server-only";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";

/**
 * Podcast episodes and work entries for bertomill.com.
 *
 * These are markdown files on disk (`content/podcast`, `content/work`) rather
 * than database rows: published work is versioned with the code, reviewable in a
 * diff, and needs no auth path to edit. Writing moved to the database
 * (lib/posts.ts) so Cael can draft and edit articles without a deploy.
 */

export type ContentKind = "writing" | "podcast" | "work";

export interface ContentMeta {
  slug: string;
  kind: ContentKind;
  title: string;
  /** ISO date (YYYY-MM-DD). Drives ordering and the visible dateline. */
  date: string;
  summary: string;
  tags: string[];
  /** Podcast only — where the episode can be watched or heard. */
  youtube?: string;
  /** Spotify episode id (the part after `/episode/` in a share link). */
  spotify?: string;
  audio?: string;
  duration?: string;
  /** Work only — who it was for, what I was there as, and when. */
  org?: string;
  role?: string;
  year?: string;
  /** Work only — the one-line result, shown on the tile and under the title. */
  outcome?: string;
  /** Work only — tile background (any CSS colour). Typographic tiles until there are images. */
  color?: string;
  /** Work only — optional hero image under `public/`, e.g. `/work/aucctus.jpg`. */
  image?: string;
  /** Set to false in frontmatter to keep a file on disk but off the site. */
  published: boolean;
}

export interface ContentEntry extends ContentMeta {
  body: string;
  /** Rough read time in minutes, at 220 words/minute. */
  readingMinutes: number;
}

const CONTENT_ROOT = path.join(process.cwd(), "content");

/**
 * YAML turns an unquoted `date: 2026-08-16` into a JS Date, not a string, so a
 * naive `typeof === "string"` check silently datelines every post 1 Jan 1970.
 * Accept both forms and always hand back `YYYY-MM-DD`.
 */
function toDateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime()))
    return value.toISOString().slice(0, 10);
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value))
    return value.slice(0, 10);
  return null;
}

function toMeta(
  kind: ContentKind,
  slug: string,
  data: Record<string, unknown>,
): ContentMeta {
  return {
    slug,
    kind,
    title: typeof data.title === "string" ? data.title : slug,
    date: toDateString(data.date) ?? new Date(0).toISOString().slice(0, 10),
    summary: typeof data.summary === "string" ? data.summary : "",
    tags: Array.isArray(data.tags) ? data.tags.map(String) : [],
    youtube: typeof data.youtube === "string" ? data.youtube : undefined,
    spotify: typeof data.spotify === "string" ? data.spotify : undefined,
    audio: typeof data.audio === "string" ? data.audio : undefined,
    duration: typeof data.duration === "string" ? data.duration : undefined,
    org: typeof data.org === "string" ? data.org : undefined,
    role: typeof data.role === "string" ? data.role : undefined,
    year:
      data.year !== undefined && data.year !== null
        ? String(data.year)
        : undefined,
    outcome: typeof data.outcome === "string" ? data.outcome : undefined,
    color: typeof data.color === "string" ? data.color : undefined,
    image: typeof data.image === "string" ? data.image : undefined,
    published: data.published !== false,
  };
}

async function readEntry(
  kind: ContentKind,
  file: string,
): Promise<ContentEntry | null> {
  if (!file.endsWith(".md")) return null;
  const slug = file.replace(/\.md$/, "");
  const raw = await readFile(path.join(CONTENT_ROOT, kind, file), "utf8");
  const { data, content } = matter(raw);
  const words = content.split(/\s+/).filter(Boolean).length;
  return {
    ...toMeta(kind, slug, data as Record<string, unknown>),
    body: content.trim(),
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/** Every published entry of a kind, newest first. */
export async function listContent(kind: ContentKind): Promise<ContentEntry[]> {
  let files: string[];
  try {
    files = await readdir(path.join(CONTENT_ROOT, kind));
  } catch {
    return []; // No directory yet — an empty section, not an error page.
  }
  const entries = await Promise.all(files.map((f) => readEntry(kind, f)));
  return entries
    .filter((e): e is ContentEntry => e !== null && e.published)
    .sort((a, b) => b.date.localeCompare(a.date));
}

export async function getContent(
  kind: ContentKind,
  slug: string,
): Promise<ContentEntry | null> {
  try {
    const entry = await readEntry(kind, `${slug}.md`);
    return entry?.published ? entry : null;
  } catch {
    return null;
  }
}

export function formatDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  });
}

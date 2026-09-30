import { getDb } from "./db";

/**
 * Articles on bertomill.com/writing that Cael writes and edits.
 *
 * These are database rows, not markdown in the repo, so an edit is live in a
 * minute without a commit or a redeploy, and a draft can be previewed before
 * anyone else sees it. The Writing index shows these next to the Substack feed
 * (lib/substack.ts). Podcast and Work are still markdown files (lib/content.ts).
 */

export type PostStatus = "draft" | "published";

export interface Post {
  id: number;
  slug: string;
  title: string;
  summary: string;
  body: string;
  tags: string[];
  coverUrl: string | null;
  coverAlt: string | null;
  status: PostStatus;
  /** ISO date (YYYY-MM-DD) once published; null for a draft never published. */
  publishedAt: string | null;
  previewToken: string;
  updatedAt: string;
  /** Rough read time in minutes, at 220 words/minute. */
  readingMinutes: number;
}

export const PUBLIC_SITE_URL = "https://bertomill.com";

export function postUrl(post: Pick<Post, "slug" | "status" | "previewToken">): string {
  const base = `${PUBLIC_SITE_URL}/writing/${post.slug}`;
  return post.status === "published" ? base : `${base}?preview=${post.previewToken}`;
}

export function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 80);
}

/**
 * The Neon driver hands a DATE column back as a JS Date at *local* midnight, so
 * toISOString() would shift it a day east of UTC. Read the local parts instead.
 */
function toDateString(value: unknown): string | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  }
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
  return null;
}

function toPost(row: Record<string, unknown>): Post {
  const body = String(row.body ?? "");
  const words = body.split(/\s+/).filter(Boolean).length;
  return {
    id: Number(row.id),
    slug: String(row.slug),
    title: String(row.title),
    summary: String(row.summary ?? ""),
    body,
    tags: Array.isArray(row.tags) ? row.tags.map(String) : [],
    coverUrl: (row.cover_url as string | null) ?? null,
    coverAlt: (row.cover_alt as string | null) ?? null,
    status: row.status === "published" ? "published" : "draft",
    publishedAt: toDateString(row.published_at),
    previewToken: String(row.preview_token),
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
    readingMinutes: Math.max(1, Math.round(words / 220)),
  };
}

/** Published posts, newest first. A database outage is an empty list, not an error page. */
export async function listPublishedPosts(): Promise<Post[]> {
  try {
    const rows = await getDb()`
      SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC
    `;
    return rows.map(toPost);
  } catch (error) {
    console.error("posts unavailable:", error);
    return [];
  }
}

/** Every post, drafts included, most recently edited first. */
export async function listAllPosts(): Promise<Post[]> {
  const rows = await getDb()`SELECT * FROM posts ORDER BY updated_at DESC`;
  return rows.map(toPost);
}

export async function getPostById(id: number): Promise<Post | null> {
  const [row] = await getDb()`SELECT * FROM posts WHERE id = ${id}`;
  return row ? toPost(row) : null;
}

export async function getPost(slug: string): Promise<Post | null> {
  const [row] = await getDb()`SELECT * FROM posts WHERE slug = ${slug}`;
  return row ? toPost(row) : null;
}

/**
 * What the public page may show: a published post, or a draft when the request
 * carries that draft's preview token.
 */
export async function getVisiblePost(slug: string, previewToken?: string | null): Promise<Post | null> {
  const post = await getPost(slug).catch(() => null);
  if (!post) return null;
  if (post.status === "published") return post;
  return previewToken && previewToken === post.previewToken ? post : null;
}

export interface PostFields {
  title?: string;
  summary?: string;
  body?: string;
  tags?: string[];
  coverUrl?: string | null;
  coverAlt?: string | null;
}

export async function createPost(slug: string, fields: PostFields & { title: string }): Promise<Post> {
  const [row] = await getDb()`
    INSERT INTO posts (slug, title, summary, body, tags, cover_url, cover_alt)
    VALUES (${slug}, ${fields.title}, ${fields.summary ?? ""}, ${fields.body ?? ""},
            ${fields.tags ?? []}, ${fields.coverUrl ?? null}, ${fields.coverAlt ?? null})
    RETURNING *
  `;
  return toPost(row);
}

/** Change only the fields given; `undefined` leaves a field alone, `null` clears a cover. */
export async function updatePost(slug: string, fields: PostFields & { slug?: string }): Promise<Post | null> {
  const current = await getPost(slug);
  if (!current) return null;
  const next = {
    slug: fields.slug ?? current.slug,
    title: fields.title ?? current.title,
    summary: fields.summary ?? current.summary,
    body: fields.body ?? current.body,
    tags: fields.tags ?? current.tags,
    coverUrl: fields.coverUrl === undefined ? current.coverUrl : fields.coverUrl,
    coverAlt: fields.coverAlt === undefined ? current.coverAlt : fields.coverAlt,
  };
  const [row] = await getDb()`
    UPDATE posts SET
      slug = ${next.slug}, title = ${next.title}, summary = ${next.summary}, body = ${next.body},
      tags = ${next.tags}, cover_url = ${next.coverUrl}, cover_alt = ${next.coverAlt}, updated_at = NOW()
    WHERE id = ${current.id}
    RETURNING *
  `;
  return toPost(row);
}

/**
 * Publish or take down. Publishing keeps an existing dateline (a re-publish after
 * an unpublish is the same article) unless `date` is given.
 */
export async function setPostStatus(slug: string, status: PostStatus, date?: string): Promise<Post | null> {
  const [row] = await getDb()`
    UPDATE posts SET
      status = ${status},
      published_at = CASE
        WHEN ${status} = 'published' THEN COALESCE(${date ?? null}::date, published_at, CURRENT_DATE)
        ELSE published_at END,
      updated_at = NOW()
    WHERE slug = ${slug}
    RETURNING *
  `;
  return row ? toPost(row) : null;
}

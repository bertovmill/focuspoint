// Creates the `posts` table on the live Neon DB and moves the markdown articles
// in content/writing/ into it (bertomill.com/writing now reads posts from the DB).
// Mirrors the block in lib/db.ts ensureSchema(). Idempotent — safe to re-run;
// an article already in the table is left alone.
//   node --env-file=.env.local scripts/posts-migrate.mjs
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import matter from "gray-matter";
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`
  CREATE TABLE IF NOT EXISTS posts (
    id SERIAL PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    title TEXT NOT NULL,
    summary TEXT NOT NULL DEFAULT '',
    body TEXT NOT NULL DEFAULT '',
    tags TEXT[] NOT NULL DEFAULT '{}',
    cover_url TEXT,
    cover_alt TEXT,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
    published_at DATE,
    preview_token TEXT NOT NULL DEFAULT md5(random()::text || clock_timestamp()::text),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )
`;

const dir = path.join(process.cwd(), "content", "writing");
let files = [];
try {
  files = (await readdir(dir)).filter((f) => f.endsWith(".md"));
} catch {}

for (const file of files) {
  const slug = file.replace(/\.md$/, "");
  const { data, content } = matter(await readFile(path.join(dir, file), "utf8"));
  const date = data.date instanceof Date ? data.date.toISOString().slice(0, 10) : String(data.date ?? "").slice(0, 10) || null;
  const status = data.published === false ? "draft" : "published";
  const rows = await sql`
    INSERT INTO posts (slug, title, summary, body, tags, status, published_at)
    VALUES (${slug}, ${data.title ?? slug}, ${data.summary ?? ""}, ${content.trim()},
            ${Array.isArray(data.tags) ? data.tags.map(String) : []}, ${status}, ${date})
    ON CONFLICT (slug) DO NOTHING
    RETURNING id
  `;
  console.log(rows.length ? `imported ${slug} (${status})` : `skipped ${slug} (already in posts)`);
}
console.log("posts table ready");

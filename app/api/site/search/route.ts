import { NextResponse } from "next/server";
import { listContent } from "@/lib/content";
import { listPublishedPosts } from "@/lib/posts";
import { listSubstackPosts } from "@/lib/substack";

/**
 * GET → the public site's search index for the `/` palette
 * (app/site/_components/site-command-palette.tsx): every published post, episode
 * and work page by title and href. Public on bertomill.com through the
 * `/api/site` passthrough in lib/public-site.ts; cached at the CDN for five
 * minutes so a palette opening never queries Postgres or Substack twice.
 */
export async function GET() {
  const [own, substack, episodes, work] = await Promise.all([
    listPublishedPosts().catch(() => []),
    listSubstackPosts().catch(() => []),
    listContent("podcast").catch(() => []),
    listContent("work").catch(() => []),
  ]);

  const posts = [
    ...own.map((p) => ({ title: p.title, href: `/writing/${p.slug}`, date: p.publishedAt ?? "", external: false })),
    ...substack.map((p) => ({ title: p.title, href: p.url, date: p.date, external: true })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return NextResponse.json(
    {
      posts,
      episodes: episodes.map((e) => ({ title: e.title, href: `/podcast/${e.slug}`, date: e.date })),
      work: work.map((w) => ({ title: w.title, href: `/work/${w.slug}`, org: w.org, year: w.year })),
    },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } },
  );
}

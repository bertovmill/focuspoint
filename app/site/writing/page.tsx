import type { Metadata } from "next";
import { ArrowUpRightIcon } from "lucide-react";
import Image from "next/image";
import { formatDate } from "@/lib/content";
import { listPublishedPosts } from "@/lib/posts";
import { listSubstackPosts, SUBSTACK_URL } from "@/lib/substack";
import { SiteLink } from "../_components/site-link";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";

// Short, so a post Cael publishes shows up within a minute. The Substack feed
// keeps its own hour-long fetch cache underneath.
export const revalidate = 60;

/** One row on the index: an article on this site, or a Substack post that links out. */
interface IndexEntry {
  key: string;
  title: string;
  href: string;
  date: string;
  summary: string;
  tags: string[];
  readingMinutes: number;
  coverUrl: string | null;
  source: "site" | "substack";
}

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Notes on building AI agents, shipping software, and running a life with one.",
};

export default async function WritingIndexPage() {
  const [own, substack] = await Promise.all([listPublishedPosts(), listSubstackPosts()]);
  const posts: IndexEntry[] = [
    ...own.map((p) => ({
      key: `site:${p.slug}`,
      title: p.title,
      href: `/writing/${p.slug}`,
      date: p.publishedAt ?? "",
      summary: p.summary,
      tags: p.tags,
      readingMinutes: p.readingMinutes,
      coverUrl: p.coverUrl,
      source: "site" as const,
    })),
    ...substack.map((p) => ({
      key: `substack:${p.url}`,
      title: p.title,
      href: p.url,
      date: p.date,
      summary: p.summary,
      tags: p.tags,
      readingMinutes: p.readingMinutes,
      coverUrl: null,
      source: "substack" as const,
    })),
  ].sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto max-w-3xl px-6">
      {/* The header sits on the homepage's lit concrete wall, without its chalk
          drawings, like About and Work. */}
      <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
        <ConcreteWall sketches={false} />
        <section className="py-16 sm:py-24">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Writing
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Notes on building AI agents, shipping software, and what it&apos;s
            actually like to hand parts of your life to one. Some of it lives
            here, some on Substack.
          </p>
          <SiteLink
            href={SUBSTACK_URL}
            className="mt-6 inline-flex items-center gap-1.5 font-mono text-xs uppercase tracking-[0.18em] text-primary transition-colors hover:text-foreground"
          >
            Subscribe on Substack
            <ArrowUpRightIcon className="size-3.5" />
          </SiteLink>
        </section>
      </div>

      <section className="py-8">
        {posts.length === 0 ? (
          <p className="py-8 text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {posts.map((post) => (
              <li key={post.key}>
                <SiteLink href={post.href} className="group flex gap-5 py-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-4">
                      <h2 className="text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                        {post.title}
                      </h2>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDate(post.date)}
                      </span>
                    </div>
                    {post.summary && (
                      <p className="mt-2 leading-relaxed text-muted-foreground">
                        {post.summary}
                      </p>
                    )}
                    <p className="mt-3 font-mono text-xs text-muted-foreground">
                      {post.readingMinutes} min read
                      {post.tags.length > 0 ? ` · ${post.tags.join(" · ")}` : ""}
                      {post.source === "substack" ? " · Substack" : ""}
                    </p>
                  </div>
                  {post.coverUrl && (
                    <Image
                      src={post.coverUrl}
                      alt=""
                      width={240}
                      height={160}
                      sizes="120px"
                      className="hidden aspect-[3/2] w-28 shrink-0 self-center rounded-md border border-border object-cover sm:block"
                    />
                  )}
                </SiteLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

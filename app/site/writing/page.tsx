import type { Metadata } from "next";
import Image from "next/image";
import { formatDate } from "@/lib/content";
import { listPublishedPosts } from "@/lib/posts";
import { listMediumPosts } from "@/lib/medium";
import { listSubstackPosts } from "@/lib/substack";
import { SiteLink } from "../_components/site-link";
import { SubscribeForm } from "../_components/subscribe-form";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";

// Short, so a post Cael publishes shows up within a minute. The Substack feed
// and Medium feeds keep their own hour-long fetch caches underneath.
export const revalidate = 60;

/** One row on the index: an article on this site, or a Substack or Medium post that links out. */
interface IndexEntry {
  key: string;
  title: string;
  href: string;
  date: string;
  summary: string;
  tags: string[];
  readingMinutes: number;
  coverUrl: string | null;
  source: "site" | "substack" | "medium";
}

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Notes on building AI agents, shipping software, and running a life with one.",
};

export default async function WritingIndexPage() {
  const [own, substack, medium] = await Promise.all([
    listPublishedPosts(),
    listSubstackPosts(),
    listMediumPosts(),
  ]);
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
    ...medium.map((p) => ({
      key: `medium:${p.url}`,
      title: p.title,
      href: p.url,
      date: p.date,
      summary: p.summary,
      tags: [] as string[],
      readingMinutes: p.readingMinutes,
      coverUrl: p.coverUrl,
      source: "medium" as const,
    })),
  ]
    // A post cross-posted to Medium shows once, as the version listed first above.
    .filter(
      (post, i, all) =>
        all.findIndex((other) => sameTitle(other.title, post.title)) === i,
    )
    .sort((a, b) => b.date.localeCompare(a.date));

  return (
    <div className="mx-auto max-w-3xl px-6">
      {/* The header sits on the homepage's lit concrete wall, without its chalk
          drawings, like About and Work. */}
      <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
        <ConcreteWall />
        <section className="py-16 sm:py-24">
          <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
            Writing
          </h1>
          <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
            Notes on building AI agents, shipping software, and what it&apos;s
            actually like to hand parts of your life to one. Some of it lives
            here, some on Substack and Medium.
          </p>
          {/* The same sign-up as the homepage hero. */}
          <div id="writing-newsletter" className="mt-8 max-w-md">
            <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground/60">
              Get what I&apos;m learning building AI, by email
            </p>
            <SubscribeForm source="writing" />
          </div>
        </section>
      </div>

      <section className="py-8">
        {posts.length === 0 ? (
          <p className="py-8 text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {posts.map((post) => (
              <li key={post.key}>
                <SiteLink href={post.href} className="group flex flex-col-reverse gap-4 py-6 sm:flex-row sm:gap-6">
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
                      {post.tags.length > 0
                        ? ` · ${post.tags.join(" · ")}`
                        : ""}
                      {post.source === "substack" ? " · Substack" : ""}
                      {post.source === "medium" ? " · Medium" : ""}
                    </p>
                  </div>
                  {post.coverUrl && (
                    <Image
                      src={post.coverUrl}
                      alt=""
                      width={384}
                      height={240}
                      // Full width above the title on phones, a 12rem thumbnail beside it from sm up.
                      sizes="(min-width: 640px) 192px, 100vw"
                      className="aspect-[16/10] w-full shrink-0 self-start rounded-lg border border-border object-cover transition-transform duration-300 group-hover:scale-[1.02] sm:w-48"
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

/** Titles match when they're the same words, ignoring case, quotes and punctuation. */
function sameTitle(a: string, b: string): boolean {
  const norm = (t: string) =>
    t
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
  return norm(a) === norm(b);
}

import type { Metadata } from "next";
import Image from "next/image";
import { ArrowUpRightIcon } from "lucide-react";
import { formatDate } from "@/lib/content";
import { listPublishedPosts } from "@/lib/posts";
import { listMediumPosts } from "@/lib/medium";
import { listSubstackPosts } from "@/lib/substack";
import { cn } from "@/lib/utils";
import { SiteLink } from "../_components/site-link";
import { SubscribeForm } from "../_components/subscribe-form";

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
  alternates: { canonical: "/writing" },
  description:
    "Notes on building AI agents, shipping software, and running a life with one.",
};

/* The card colours from `.writing-paper`, as classes Tailwind can see. */
const TINTS = [
  "bg-[var(--tint-1)]",
  "bg-[var(--tint-2)]",
  "bg-[var(--tint-3)]",
  "bg-[var(--tint-4)]",
  "bg-[var(--tint-5)]",
  "bg-[var(--tint-6)]",
];

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

  const [featured, ...rest] = posts;

  return (
    <div className="mx-auto max-w-6xl px-6 pb-24">
      <header className="grid gap-10 pt-14 pb-12 sm:pt-20 lg:grid-cols-[1.4fr_1fr] lg:items-end">
        <div>
          <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
            Robert Mill · Notes from the build
          </p>
          <h1 className="font-display mt-4 text-6xl leading-[0.95] font-medium tracking-tight sm:text-8xl">
            Writing<span className="text-primary">.</span>
          </h1>
          <p className="mt-6 max-w-xl font-serif text-xl leading-relaxed text-muted-foreground sm:text-2xl">
            Building AI agents, shipping software, and what it&apos;s{" "}
            <em className="text-foreground">actually</em> like to hand parts of your life to one.
          </p>
        </div>
        {/* The same sign-up as the homepage hero. */}
        <div
          id="writing-newsletter"
          className="rounded-3xl bg-[var(--tint-3)] p-6 sm:p-7"
        >
          <p className="font-display text-2xl font-medium leading-snug">
            Get the next one by email.
          </p>
          <p className="mt-2 font-serif text-lg text-muted-foreground">
            What I&apos;m learning building AI, as I learn it. One click to leave.
          </p>
          <SubscribeForm source="writing" className="mt-5" />
        </div>
      </header>

      {!featured ? (
        <p className="py-8 font-serif text-lg text-muted-foreground">Nothing published yet.</p>
      ) : (
        <>
          <FeaturedPost post={featured} tint={tintFor(3)} />
          {rest.length > 0 && (
            <section aria-labelledby="writing-more" className="mt-20">
              <h2
                id="writing-more"
                className="font-display flex items-center gap-4 text-3xl font-medium tracking-tight"
              >
                More to read
                <span aria-hidden className="h-px flex-1 bg-border" />
              </h2>
              <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((post, i) => (
                  <li key={post.key}>
                    <PostCard post={post} tint={tintFor(i)} />
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </div>
  );
}

/** The newest post, big: cover beside a large headline. */
function FeaturedPost({ post, tint }: { post: IndexEntry; tint: string }) {
  return (
    <SiteLink
      href={post.href}
      className={cn(
        "group grid overflow-hidden rounded-[2rem] transition-transform duration-300 hover:-translate-y-1 md:grid-cols-[1.15fr_1fr]",
        tint,
      )}
    >
      <div className="relative min-h-64 overflow-hidden md:min-h-[26rem]">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt=""
            fill
            priority
            sizes="(min-width: 768px) 600px, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <Monogram title={post.title} large />
        )}
      </div>
      <div className="flex flex-col justify-center p-8 sm:p-10">
        <p className="font-mono text-xs uppercase tracking-[0.2em] text-primary">
          Latest · {formatDate(post.date)}
        </p>
        <h2 className="font-display mt-4 text-4xl leading-[1.05] font-medium tracking-tight text-balance sm:text-5xl">
          {post.title}
        </h2>
        {post.summary && (
          <p className="mt-5 font-serif text-xl leading-relaxed text-foreground/75">
            {post.summary}
          </p>
        )}
        <p className="mt-8 inline-flex items-center gap-2 font-medium">
          <span className="border-b-2 border-primary pb-0.5">
            {post.source === "site" ? "Read it" : `Read on ${sourceName(post.source)}`}
          </span>
          <ArrowUpRightIcon className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
          <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
            {post.readingMinutes} min
          </span>
        </p>
      </div>
    </SiteLink>
  );
}

function PostCard({ post, tint }: { post: IndexEntry; tint: string }) {
  return (
    <SiteLink
      href={post.href}
      className={cn(
        "group flex h-full flex-col overflow-hidden rounded-3xl transition duration-300 hover:-translate-y-1 hover:-rotate-[0.6deg] hover:shadow-[0_18px_40px_-18px_rgba(60,35,10,0.35)]",
        tint,
      )}
    >
      <div className="relative aspect-[16/10] overflow-hidden">
        {post.coverUrl ? (
          <Image
            src={post.coverUrl}
            alt=""
            fill
            sizes="(min-width: 1024px) 360px, (min-width: 640px) 50vw, 100vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        ) : (
          <Monogram title={post.title} />
        )}
      </div>
      <div className="flex flex-1 flex-col p-6">
        <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">
          {formatDate(post.date)}
        </p>
        <h3 className="font-display mt-3 text-2xl leading-tight font-medium tracking-tight text-balance">
          {post.title}
        </h3>
        {post.summary && (
          <p className="mt-3 line-clamp-3 font-serif text-lg leading-snug text-foreground/70">
            {post.summary}
          </p>
        )}
        <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-[0.18em] text-foreground/55">
          {post.readingMinutes} min read
          {post.source !== "site" ? ` · ${sourceName(post.source)} ↗` : ""}
        </p>
      </div>
    </SiteLink>
  );
}

/** Stand-in art for a post with no cover: its first letter, huge, in the card's ink. */
function Monogram({ title, large }: { title: string; large?: boolean }) {
  const letter = title.replace(/[^a-z0-9]/gi, "").charAt(0).toUpperCase() || "✳";
  return (
    <div
      aria-hidden
      className="absolute inset-0 flex items-center justify-center bg-foreground/[0.04]"
    >
      <span
        className={cn(
          "font-display font-semibold italic leading-none text-primary/80 transition-transform duration-500 group-hover:rotate-[-6deg] group-hover:scale-110",
          large ? "text-[14rem]" : "text-[8rem]",
        )}
      >
        {letter}
      </span>
    </div>
  );
}

function sourceName(source: IndexEntry["source"]): string {
  return source === "substack" ? "Substack" : source === "medium" ? "Medium" : "";
}

/** Tints in order down the page, so no two neighbouring cards share one. */
function tintFor(index: number): string {
  return TINTS[index % TINTS.length];
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

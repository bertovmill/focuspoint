import type { Metadata } from "next";
import { ArrowUpRightIcon } from "lucide-react";
import { formatDate } from "@/lib/content";
import { listSubstackPosts, SUBSTACK_URL } from "@/lib/substack";
import { SiteLink } from "../_components/site-link";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";

export const revalidate = 300;

export const metadata: Metadata = {
  title: "Writing",
  description:
    "Notes on building AI agents, shipping software, and running a life with one.",
};

export default async function WritingIndexPage() {
  const posts = await listSubstackPosts();

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
            actually like to hand parts of your life to one. Published on
            Substack.
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
              <li key={post.url}>
                <SiteLink href={post.url} className="group block py-6">
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
                    {" · Substack"}
                  </p>
                </SiteLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

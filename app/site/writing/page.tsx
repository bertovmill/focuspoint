import type { Metadata } from "next";
import { listContent, formatDate } from "@/lib/content";
import { SiteLink } from "../_components/site-link";

export const metadata: Metadata = {
  title: "Writing",
  description: "Notes on building AI agents, shipping software, and running a life with one.",
};

export default async function WritingIndexPage() {
  const posts = await listContent("writing");

  return (
    <div className="mx-auto max-w-3xl px-6">
      <section className="border-b border-border/60 py-16">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Writing</h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          Notes on building AI agents, shipping software, and what it&apos;s actually like to hand
          parts of your life to one.
        </p>
      </section>

      <section className="py-8">
        {posts.length === 0 ? (
          <p className="py-8 text-muted-foreground">Nothing published yet.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {posts.map((post) => (
              <li key={post.slug}>
                <SiteLink href={`/writing/${post.slug}`} className="group block py-6">
                  <div className="flex items-baseline gap-4">
                    <h2 className="text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                      {post.title}
                    </h2>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                      {formatDate(post.date)}
                    </span>
                  </div>
                  {post.summary && (
                    <p className="mt-2 leading-relaxed text-muted-foreground">{post.summary}</p>
                  )}
                  <p className="mt-3 font-mono text-xs text-muted-foreground">
                    {post.readingMinutes} min read
                    {post.tags.length > 0 ? ` · ${post.tags.join(" · ")}` : ""}
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

import type { Metadata } from "next";
import { listContent, formatDate } from "@/lib/content";
import { SubscribeForm } from "../_components/subscribe-form";
import { SiteLink } from "../_components/site-link";

export const metadata: Metadata = {
  title: "Newsletter",
  description:
    "Occasional notes on building AI agents, shipping software, and running a life with one. No spam, one click to leave.",
};

export default async function NewsletterPage() {
  // Show what actually gets written rather than describing it — the archive is
  // the honest answer to "what am I signing up for?".
  const writing = await listContent("writing");

  return (
    <div className="mx-auto max-w-3xl px-6">
      <section className="border-b border-border/60 py-16">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Newsletter</p>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-4xl">
          Get what I&apos;m learning
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-muted-foreground">
          I&apos;m building AI agents — including one that runs my own life — and writing down what
          works as I go. When I publish something, you get it. That&apos;s the whole deal.
        </p>

        <SubscribeForm className="mt-8 sm:max-w-md" />

        <p className="mt-4 text-sm text-muted-foreground">
          No spam, no schedule I don&apos;t keep, one click to leave.
        </p>
      </section>

      <section className="py-12">
        <h2 className="text-sm font-medium tracking-tight">What you&apos;d have got</h2>
        {writing.length === 0 ? (
          <p className="mt-4 text-muted-foreground">The first issue is on its way.</p>
        ) : (
          <ul className="mt-5 divide-y divide-border/60">
            {writing.map((post) => (
              <li key={post.slug}>
                <SiteLink href={`/writing/${post.slug}`} className="group block py-4">
                  <div className="flex items-baseline gap-4">
                    <h3 className="font-medium tracking-tight transition-colors group-hover:text-primary">
                      {post.title}
                    </h3>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                      {formatDate(post.date)}
                    </span>
                  </div>
                  {post.summary && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{post.summary}</p>
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

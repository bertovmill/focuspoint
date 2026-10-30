import type { Metadata } from "next";
import { listContent, formatDate } from "@/lib/content";
import { SiteLink } from "../_components/site-link";
import { SubscribeForm } from "../_components/subscribe-form";

export const metadata: Metadata = {
  title: "Podcast",
  alternates: { canonical: "/podcast" },
  description: "Conversations with Cael — my personal AI agent — recorded as they happen.",
};

export default async function PodcastIndexPage() {
  const episodes = await listContent("podcast");

  return (
    <div className="mx-auto max-w-3xl px-6">
      <section className="border-b border-border/60 py-16">
        <h1 className="font-display text-5xl font-medium tracking-tight sm:text-6xl">Podcast<span className="text-primary">.</span></h1>
        <p className="mt-6 font-serif text-xl leading-relaxed text-muted-foreground sm:text-2xl">
          Conversations with Cael, my personal agent — recorded as they actually happen. I ask, it
          answers out loud, and we work through whatever I&apos;m stuck on.
        </p>
        {/* The same sign-up as the homepage hero and /writing. */}
        <div id="podcast-newsletter" className="mt-8 max-w-md">
          <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground/60">
            Get what I&apos;m learning building AI, by email
          </p>
          <SubscribeForm source="podcast" />
        </div>
      </section>

      <section className="py-8">
        {episodes.length === 0 ? (
          <p className="py-8 text-muted-foreground">First episode is in the edit.</p>
        ) : (
          <ul className="divide-y divide-border/60">
            {episodes.map((ep, i) => (
              <li key={ep.slug}>
                <SiteLink href={`/podcast/${ep.slug}`} className="group flex gap-5 py-6">
                  <span className="font-display mt-0.5 text-3xl font-medium italic text-primary tabular-nums">
                    {String(episodes.length - i).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-medium tracking-tight transition-colors group-hover:text-primary">
                      {ep.title}
                    </h2>
                    {ep.summary && <p className="mt-2 font-serif text-lg leading-snug text-muted-foreground">{ep.summary}</p>}
                    <p className="mt-3 font-mono text-xs text-muted-foreground">
                      {formatDate(ep.date)}
                      {ep.duration ? ` · ${ep.duration}` : ""}
                    </p>
                  </div>
                </SiteLink>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

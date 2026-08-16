import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { getPublicStats } from "@/lib/public-data";
import { listContent, formatDate } from "@/lib/content";
import { SiteLink } from "./_components/site-link";

// The numbers come from a live database; five minutes of staleness is plenty.
export const revalidate = 300;

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function SiteHomePage() {
  // A database hiccup should degrade the numbers, not take down the front page.
  const [stats, writing, episodes] = await Promise.all([
    getPublicStats().catch(() => null),
    listContent("writing"),
    listContent("podcast"),
  ]);

  const latestWriting = writing.slice(0, 3);
  const latestEpisode = episodes[0];

  return (
    <div className="mx-auto max-w-5xl px-6">
      {/* Hero */}
      <section className="border-b border-border/60 py-20 sm:py-28">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">Toronto · building in public</p>
        <h1 className="mt-5 max-w-3xl text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
          I build AI agents, and I let one run my life.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          I&apos;m Berto. For the past while I&apos;ve been building{" "}
          <span className="text-foreground">Cael</span>
          {" — a personal agent that holds my goals, my "}
          reading, my training and my calendar, and nudges me toward the life I said I wanted. This
          site is the window into that: what I&apos;m building, what I&apos;m learning, and the real
          numbers underneath.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-3">
          <SiteLink
            href="/building"
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            See the numbers
            <ArrowRightIcon className="size-4" />
          </SiteLink>
          <SiteLink
            href="/chat"
            className="inline-flex items-center gap-2 rounded-lg border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
          >
            Ask Cael about me
          </SiteLink>
        </div>
      </section>

      {/* Live counters */}
      {stats && (
        <section className="border-b border-border/60 py-12">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={String(stats.booksRead)} label="Books finished" />
            <StatTile value={String(stats.tasksShipped)} label="Tasks completed" />
            <StatTile value={String(stats.shippedLast30Days)} label="Shipped, last 30 days" />
            <StatTile value={String(stats.trips)} label="Trips taken" />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            Pulled live from Cael&apos;s database.{" "}
            <SiteLink href="/building" className="text-primary underline-offset-4 hover:underline">
              The full picture →
            </SiteLink>
          </p>
        </section>
      )}

      {/* Writing */}
      <section className="border-b border-border/60 py-14">
        <div className="flex items-baseline justify-between">
          <h2 className="text-xl font-semibold tracking-tight">Writing</h2>
          <SiteLink href="/writing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
            All posts →
          </SiteLink>
        </div>
        {latestWriting.length === 0 ? (
          <p className="mt-6 text-muted-foreground">First post is on the way.</p>
        ) : (
          <ul className="mt-6 divide-y divide-border/60">
            {latestWriting.map((post) => (
              <li key={post.slug}>
                <SiteLink href={`/writing/${post.slug}`} className="group flex flex-col gap-1 py-5">
                  <div className="flex items-baseline gap-3">
                    <h3 className="font-medium tracking-tight transition-colors group-hover:text-primary">
                      {post.title}
                    </h3>
                    <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                      {formatDate(post.date)}
                    </span>
                  </div>
                  {post.summary && <p className="text-sm leading-relaxed text-muted-foreground">{post.summary}</p>}
                </SiteLink>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Podcast */}
      {latestEpisode && (
        <section className="py-14">
          <div className="flex items-baseline justify-between">
            <h2 className="text-xl font-semibold tracking-tight">Latest episode</h2>
            <SiteLink href="/podcast" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              All episodes →
            </SiteLink>
          </div>
          <SiteLink
            href={`/podcast/${latestEpisode.slug}`}
            className="group mt-6 flex items-start gap-4 rounded-xl border border-border bg-card p-6 transition-colors hover:border-primary/50"
          >
            <div className="min-w-0">
              <h3 className="font-medium tracking-tight transition-colors group-hover:text-primary">
                {latestEpisode.title}
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{latestEpisode.summary}</p>
              <p className="mt-3 font-mono text-xs text-muted-foreground">
                {formatDate(latestEpisode.date)}
                {latestEpisode.duration ? ` · ${latestEpisode.duration}` : ""}
              </p>
            </div>
            <ArrowUpRightIcon className="ml-auto size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-primary" />
          </SiteLink>
        </section>
      )}
    </div>
  );
}

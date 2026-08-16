import Image from "next/image";
import { ArrowRightIcon } from "lucide-react";
import { DotPattern } from "@/components/ui/dot-pattern";
import { cn } from "@/lib/utils";
import { getPublicStats } from "@/lib/public-data";
import { listContent, formatDate } from "@/lib/content";
import { SiteLink } from "./_components/site-link";
import { RevealOnView } from "./_components/reveal-on-view";
import { AnimatedHeading } from "./_components/animated-heading";
import { StoryCard } from "./_components/story-card";

// The numbers come from a live database; five minutes of staleness is plenty.
export const revalidate = 300;

/** Height of one full-bleed panel: the viewport, less the sticky nav and the gutters. */
const PANEL_HEIGHT = "lg:h-[calc(100svh-5.5rem)]";

/**
 * The card stays put on every desktop screen — that's the whole idea of the
 * layout, so it is never traded away for a short viewport. Instead the card's
 * own content is sized to fit a panel (see the `short` variant, which tightens
 * the type and spacing below 880px tall), with `overflow-y-auto` on the card as
 * the last-resort backstop so nothing can ever be cut off unreachably.
 */
const HERO_PIN = "lg:sticky lg:top-20 lg:h-[calc(100svh-5.5rem)]";

function StatTile({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <div className="font-mono text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl short:sm:text-2xl">
        {value}
      </div>
      <div className="mt-0.5 text-xs leading-snug text-muted-foreground">{label}</div>
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

  const latestWriting = writing[0];
  const latestEpisode = episodes[0];

  return (
    <div className="px-4 pt-4 pb-4">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        {/* LEFT: the pitch. Pinned on desktop while the panels scroll past it. */}
        <aside className={HERO_PIN}>
          <RevealOnView
            as="div"
            intensity="hero"
            staggerChildren
            className="relative flex flex-col justify-between gap-10 overflow-y-auto rounded-3xl border border-border bg-card p-6 sm:p-8 lg:h-full short:gap-6"
          >
            {/* Texture — barely there, just enough to stop the card reading as flat. */}
            <DotPattern
              width={14}
              height={14}
              cr={0.9}
              className="pointer-events-none absolute inset-0 h-full w-full fill-foreground/[0.12] [mask-image:radial-gradient(400px_circle_at_30%_20%,white,transparent)]"
            />

            <div className="relative">
              <div className="mb-8 flex items-center gap-2.5 short:mb-5">
                <Image
                  src="/berto-headshot.jpg"
                  alt="Berto Mill"
                  width={800}
                  height={800}
                  priority
                  sizes="44px"
                  className="size-11 rounded-full object-cover ring-1 ring-border"
                />
                <span className="text-lg font-extrabold tracking-tight">Berto Mill</span>
                <span className="size-1.5 rounded-full bg-primary" aria-hidden />
              </div>

              <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                Toronto · building in public
              </p>

              <AnimatedHeading
                // font-black is the template's signature — Geist at 900 is what
                // makes the headline read as a wordmark rather than body copy.
                // 2.5rem, not 2.75: at 900 weight "I build AI agents," measures
                // 354px against 350px of card, so the wider cut has to come down
                // a step or the first line breaks and strands a word.
                className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-[2.5rem] short:mt-3 short:sm:text-[2.25rem]"
                lines={["I build AI agents,", "and I let one run my life."]}
              />

              <p className="mt-5 max-w-[46ch] leading-relaxed text-muted-foreground short:mt-4 short:text-sm">
                For the past while I&apos;ve been building <span className="text-foreground">Cael</span> — a personal
                agent that holds my goals, my reading, my training and my calendar, and nudges me toward the life I
                said I wanted. This site is the window into that.
              </p>

              <div className="mt-7 flex flex-wrap items-center gap-3 short:mt-5">
                <SiteLink
                  href="/building"
                  className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
                >
                  See the numbers
                  <ArrowRightIcon className="size-4" />
                </SiteLink>
                <SiteLink
                  href="/chat"
                  className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
                >
                  Ask Cael about me
                </SiteLink>
              </div>
            </div>

            {/* The stats take the slot a portfolio would give to client logos. */}
            {stats && (
              <div className="relative">
                <p className="mb-4 font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground short:mb-3">
                  Live from Cael&apos;s database
                </p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4 lg:grid-cols-2 short:gap-y-3">
                  <StatTile value={String(stats.booksRead)} label="Books finished" />
                  <StatTile value={String(stats.tasksShipped)} label="Tasks completed" />
                  <StatTile value={String(stats.shippedLast30Days)} label="Shipped, 30 days" />
                  <StatTile value={String(stats.trips)} label="Trips taken" />
                </div>
              </div>
            )}
          </RevealOnView>
        </aside>

        {/* RIGHT: the four ways in, one panel each. */}
        <div className="space-y-4">
          <StoryCard
            eyebrow="01 · The agent"
            title="Cael"
            description="The agent that runs my days. Ask it about my work, my reading or what I'm building — it answers from the same data I use."
            tags={["Live", "Ask anything"]}
            href="/chat"
            imageSrc="/site-art/cael.webp"
            gradientFrom="#7c2d12"
            gradientTo="#c2410c"
            priority
            className={PANEL_HEIGHT}
          />
          <StoryCard
            eyebrow="02 · In public"
            title="Building in public"
            description="Eight forms of wealth, tracked against real targets. Books read, hours trained, trips taken — pulled live, nothing rounded up."
            tags={
              stats
                ? [`${stats.booksRead} books`, `${stats.tasksShipped} tasks shipped`]
                : ["Live numbers"]
            }
            href="/building"
            imageSrc="/site-art/building.webp"
            gradientFrom="#0c4a6e"
            gradientTo="#0891b2"
            revealDelay={0.06}
            className={PANEL_HEIGHT}
          />
          <StoryCard
            eyebrow="03 · Writing"
            title="Notes from the build"
            description={
              latestWriting?.summary ??
              "What I'm learning building agents that actually get used — the parts that worked and the parts that didn't."
            }
            tags={latestWriting ? [latestWriting.title, formatDate(latestWriting.date)] : ["Essays"]}
            href="/writing"
            imageSrc="/site-art/writing.webp"
            gradientFrom="#78350f"
            gradientTo="#a16207"
            revealDelay={0.12}
            className={PANEL_HEIGHT}
          />
          <StoryCard
            eyebrow="04 · Podcast"
            title="Conversations with Cael"
            description={
              latestEpisode?.summary ??
              "Recorded conversations with the agent — thinking out loud about goals, systems and what to build next."
            }
            tags={
              latestEpisode
                ? [latestEpisode.title, latestEpisode.duration ?? formatDate(latestEpisode.date)]
                : ["Episodes"]
            }
            href="/podcast"
            imageSrc="/site-art/podcast.webp"
            gradientFrom="#312e81"
            gradientTo="#7c3aed"
            revealDelay={0.18}
            className={PANEL_HEIGHT}
          />
        </div>
      </div>
    </div>
  );
}

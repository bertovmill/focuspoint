import type { CSSProperties } from "react";
import Image from "next/image";
import { ArrowRightIcon, ArrowUpRightIcon, SparklesIcon } from "lucide-react";
import { ASK_AI_HASH } from "@/lib/public-site";
import { listContent, formatDate } from "@/lib/content";
import { listSubstackPosts } from "@/lib/substack";
import { SiteLink } from "./_components/site-link";
import { AskAiButton } from "./_components/ask-ai";
import { RevealOnView } from "./_components/reveal-on-view";
import { AnimatedHeading } from "./_components/animated-heading";
import { ConcreteWall } from "./_components/concrete-wall/concrete-wall";
import { deskLayoutVars } from "./_components/concrete-wall/scene";
import { DeskScene } from "./_components/concrete-wall/desk-scene";
import { WindowStylePicker } from "./_components/concrete-wall/window-style-picker";
import { HeroAgents } from "./_components/hero-agents/hero-agents";
import { WallClock } from "./_components/concrete-wall/wall-clock";
import { SubscribeForm } from "./_components/subscribe-form";
import { MomentsCarousel } from "./_components/moments-carousel";

// Display type: Geist (from the root layout) at semibold with tight tracking and a
// soft ink instead of a heavy weight in pure black. Calm and current, not shouty.
const display = "font-sans font-semibold text-foreground/90";

// Writing and podcast lists come from the filesystem, but keep the page fresh
// on the same cadence as the rest of the site.
export const revalidate = 300;

const LINKEDIN_URL = "https://www.linkedin.com/in/robertvmill";
const AUCCTUS_URL = "https://aucctus.com";
const MAKERSLOUNGE_URL = "https://makerslounge.ca";

/** The three things I'm about, in the order I'd explain them to a stranger. */
const PILLARS = [
  {
    label: "Go-to-market",
    title: "Aucctus",
    logo: "/site-art/logo-aucctus.png",
    role: "Go-to-Market Lead",
    image: "/site-art/moment-innovation-roundtable-paris-aucctus.webp",
    imageAlt: "Berto at the Aucctus stand at the Innovation Roundtable in Paris",
    stat: "A full corporate pipeline in six months",
    description:
      "Aucctus helps Fortune 500 innovation teams find, test and launch new ideas with AI agents. I run enterprise pipeline and discovery, and carry what customers say back into the product.",
    href: AUCCTUS_URL,
    external: true,
  },
  {
    label: "Community",
    title: "MakersLounge",
    logo: "/site-art/logo-makerslounge.svg",
    role: "Founder",
    image: "/site-art/moment-makerslounge-4-hosting.webp",
    imageAlt: "Berto hosting a MakersLounge night in Toronto",
    stat: "1,500 builders in Toronto",
    description:
      "A Toronto community of founders and builders using AI in their businesses. Monthly demo nights, online workshops, and a matching app for finding collaborators.",
    href: MAKERSLOUNGE_URL,
    external: true,
  },
  {
    label: "Building",
    title: "Cael",
    logo: "/icon.svg",
    role: "Personal agent",
    image: "/site-art/cael.webp",
    imageAlt: "",
    stat: "Built in public, one tool at a time",
    description:
      "A side project that runs parts of my life: goals, reading, training and calendar in one place. You can ask it about my work directly.",
    // Opens the Ask AI panel rather than leaving the page.
    href: ASK_AI_HASH,
    external: false,
  },
] as const;

/**
 * Where I've worked, most recent first. Roles shorter than a few months are folded in.
 * `note` is one true line about the job; `logo` sits on its timeline dot.
 */
const EXPERIENCE = [
  {
    years: "2026 –",
    role: "Go-to-Market Lead",
    org: "Aucctus",
    logo: "/site-art/logo-aucctus.png",
    note: "Built a full corporate pipeline in the first six months, on an events motion that didn't exist when I started.",
  },
  {
    years: "2025 – 2026",
    role: "AI Solutions & GTM Consultant",
    org: "KPMG",
    logo: "/site-art/logo-kpmg.webp",
    note: "On the Ignition Tax team: built and demoed AI tools for tax professionals and led AI workshops across the practice.",
  },
  {
    years: "2025 – 2026",
    role: "Teaching Assistant, MMA capstones",
    org: "Ivey Business School",
    logo: "/site-art/logo-ivey.webp",
    note: "Guided Master of Management Analytics teams through their capstone projects.",
  },
  {
    years: "2025 – 2026",
    role: "AI Coach",
    org: "Leland",
    logo: "/site-art/logo-leland.webp",
    note: "One-on-one coaching on using AI in real work. Rated 5.0 across 9 reviews.",
  },
  {
    years: "2023 – 2025",
    role: "Innovation Strategy Consultant",
    org: "CIBC",
    logo: "/site-art/logo-cibc.webp",
    note: "On the enterprise innovation team, testing new ideas inside a big bank.",
  },
  {
    years: "2022 – 2023",
    role: "Technology Consultant",
    org: "Scelta Design & Build",
    logo: "/site-art/logo-scelta.webp",
    note: undefined,
  },
] as const satisfies readonly {
  years: string;
  role: string;
  org: string;
  logo: string;
  note?: string;
}[];

export default async function SiteHomePage() {
  const [writing, episodes] = await Promise.all([
    listSubstackPosts(),
    listContent("podcast"),
  ]);
  const latestWriting = writing[0];
  const latestEpisode = episodes[0];

  return (
    <div className="overflow-x-clip px-6">
      {/* Intro: the pitch over the concrete wall, with the desk and the window
          to Toronto. Full-viewport, headline pinned bottom-left the way koto.com
          does it, resting on the wall just above the desk. `--desk-w` is the
          desk's width; the bottom padding keeps the text above the desk top on
          wide screens and above the whole tree on phones, where the desk sits
          under the text instead of beside it. */}
      <div
        className="relative isolate -mt-16 [--desk-w:110vw] sm:[--desk-w:85vw] lg:[--desk-w:min(60vw,80vh)]"
        style={deskLayoutVars() as CSSProperties}
      >
        <ConcreteWall scene />
        <RevealOnView
          as="section"
          intensity="hero"
          staggerChildren
          className="flex min-h-svh flex-col pt-24 pb-[calc(var(--desk-w)*var(--desk-ratio)*var(--desk-tree-clear))] lg:pb-[calc(var(--desk-w)*var(--desk-ratio)*var(--desk-top-clear))]"
        >
          <div className="mt-auto pt-16 lg:max-w-[68%]">
            <Image
              src="/berto-headshot.jpg"
              alt="Robert Mill"
              width={320}
              height={320}
              priority
              className="mb-6 size-32 rounded-[24%] object-cover shadow-lg ring-1 ring-black/10 sm:size-40 lg:size-44"
            />
            <WallClock className="mb-5" />
            <AnimatedHeading
              className={`${display} watercolor-ink text-5xl leading-[1.0] tracking-[-0.045em] sm:text-7xl lg:text-[clamp(2.6rem,3.7vw,6rem)]`}
              lines={[
                "I lead go-to-market for Aucctus,",
                "a fast-scaling AI startup.",
              ]}
            />
            {/* The newsletter signup, where every visitor sees it. */}
            <div id="hero-newsletter" className="mt-8 max-w-md">
              <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground/60">
                Get what I&apos;m learning building AI, by email
              </p>
              <SubscribeForm source="hero" />
            </div>
          </div>
        </RevealOnView>
        {/* The money tree and the jar on the sill, over the text, touchable. */}
        <DeskScene />
        <HeroAgents />
        {/* The pill on the glass that swaps the window's style. */}
        <WindowStylePicker />
      </div>

      {/* In the room: photos from my LinkedIn posts as a big swipeable row. Each opens the post behind it. */}
      <section id="in-the-room" className="mx-auto max-w-6xl pt-20 sm:pt-28">
        <RevealOnView>
          <MomentsCarousel>
            <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              In the room
            </p>
            <h2
              className={`${display} mt-4 text-4xl leading-[1.0] tracking-[-0.045em] sm:text-5xl lg:text-6xl`}
            >
              Talks, hackathons and events
            </h2>
          </MomentsCarousel>
        </RevealOnView>
      </section>

      {/* About: what I'm about, as three big pillars. */}
      <section id="about-me" className="mx-auto max-w-6xl py-20 sm:py-28">
        <RevealOnView>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            About
          </p>
          <h2
            className={`${display} mt-4 text-4xl leading-[1.0] tracking-[-0.045em] sm:text-5xl lg:text-6xl`}
          >
            Work
          </h2>
        </RevealOnView>

        <ul className="mt-14 grid gap-6 sm:mt-20 md:grid-cols-3 lg:gap-8">
          {PILLARS.map((pillar, i) => {
            const inner = (
              <article className="flex h-full flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-border/70 transition-all duration-300 group-hover:-translate-y-1 group-hover:shadow-xl group-hover:ring-foreground/20">
                <div className="relative aspect-[4/3] overflow-hidden bg-[#0d0c0b]">
                  <Image
                    src={pillar.image}
                    alt={pillar.imageAlt}
                    fill
                    sizes="(min-width: 768px) 24rem, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/0 to-black/0" />
                  <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
                    <span className="rounded-full bg-black/45 px-2.5 py-1 font-mono text-[11px] uppercase tracking-[0.16em] text-white backdrop-blur-md">
                      {pillar.label}
                    </span>
                    <span className="font-mono text-xs text-white/70 tabular-nums">
                      0{i + 1}
                    </span>
                  </div>
                  <p className="absolute inset-x-0 bottom-0 p-4 text-lg font-medium leading-snug tracking-tight text-white">
                    {pillar.stat}
                  </p>
                </div>
                <div className="flex flex-1 flex-col p-6">
                  <h3
                    className={`${display} flex items-center gap-3 text-2xl tracking-[-0.035em] transition-colors group-hover:text-primary sm:text-3xl`}
                  >
                    <Image
                      src={pillar.logo}
                      alt=""
                      width={40}
                      height={40}
                      className="size-9 shrink-0 rounded-lg object-contain"
                    />
                    {pillar.title}
                    {pillar.external ? (
                      <ArrowUpRightIcon className="ml-auto size-5 opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100" />
                    ) : (
                      <ArrowRightIcon className="ml-auto size-5 opacity-50 transition-transform group-hover:translate-x-0.5 group-hover:opacity-100" />
                    )}
                  </h3>
                  <p className="mt-1 text-sm font-medium text-muted-foreground">
                    {pillar.role}
                  </p>
                  <p className="mt-4 leading-relaxed text-muted-foreground">
                    {pillar.description}
                  </p>
                </div>
              </article>
            );
            return (
              <RevealOnView as="li" delay={i * 0.08} key={pillar.title} className="h-full">
                {pillar.external ? (
                  <a
                    href={pillar.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block h-full"
                  >
                    {inner}
                  </a>
                ) : (pillar.href as string) === ASK_AI_HASH ? (
                  // A plain anchor, not a Link: the hash change is what opens the panel.
                  // (Widened to string: comparing the literal would narrow the else branch to never.)
                  <a href={pillar.href} className="group block h-full">
                    {inner}
                  </a>
                ) : (
                  <SiteLink href={pillar.href} className="group block h-full">
                    {inner}
                  </SiteLink>
                )}
              </RevealOnView>
            );
          })}
        </ul>

        <RevealOnView className="mt-16 flex flex-col gap-6 border-t border-border/60 pt-8 sm:mt-20 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-lg text-muted-foreground">
            Before this, three years in AI strategy at{" "}
            <span className="text-foreground">KPMG</span> and{" "}
            <span className="text-foreground">CIBC</span>.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              LinkedIn
              <ArrowUpRightIcon className="size-4" />
            </a>
            <AskAiButton className="border-border bg-transparent backdrop-blur-none">
              <SparklesIcon className="size-4" aria-hidden />
              Ask AI about me
            </AskAiButton>
          </div>
        </RevealOnView>
      </section>

      <div className="mx-auto max-w-3xl">
        {/* Latest */}
        {(latestWriting || latestEpisode) && (
          <section className="border-t border-border/60 py-14">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Latest
            </h2>
            <ul className="mt-6 divide-y divide-border/60">
              {latestWriting && (
                <li>
                  <SiteLink
                    href={latestWriting.url}
                    className="group block py-5"
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                        Writing
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        {formatDate(latestWriting.date)}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                      {latestWriting.title}
                    </p>
                    {latestWriting.summary && (
                      <p className="mt-1.5 leading-relaxed text-muted-foreground">
                        {latestWriting.summary}
                      </p>
                    )}
                  </SiteLink>
                </li>
              )}
              {latestEpisode && (
                <li>
                  <SiteLink
                    href={`/podcast/${latestEpisode.slug}`}
                    className="group block py-5"
                  >
                    <div className="flex items-baseline gap-4">
                      <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                        Podcast
                      </span>
                      <span className="ml-auto shrink-0 font-mono text-xs text-muted-foreground">
                        {latestEpisode.duration ??
                          formatDate(latestEpisode.date)}
                      </span>
                    </div>
                    <p className="mt-2 text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                      {latestEpisode.title}
                    </p>
                    {latestEpisode.summary && (
                      <p className="mt-1.5 leading-relaxed text-muted-foreground">
                        {latestEpisode.summary}
                      </p>
                    )}
                  </SiteLink>
                </li>
              )}
            </ul>
          </section>
        )}

        {/* Experience */}
        <section id="experience" className="border-t border-border/60 py-14">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
              Experience
            </h2>
            <a
              href={LINKEDIN_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              Full history on LinkedIn ↗
            </a>
          </div>
          <ol className="relative mt-8">
            {/* The rail the dots sit on. */}
            <span
              aria-hidden
              className="absolute top-5 bottom-5 left-5 w-px bg-gradient-to-b from-foreground/30 via-border to-transparent"
            />
            {EXPERIENCE.map((row, i) => (
              <RevealOnView
                as="li"
                delay={i * 0.05}
                key={`${row.org}-${row.role}`}
                className="relative flex gap-5 pb-8 last:pb-0"
              >
                <span className="relative z-10 grid size-10 shrink-0 place-items-center overflow-hidden rounded-xl bg-card ring-1 ring-border shadow-sm">
                  <Image
                    src={row.logo}
                    alt=""
                    width={40}
                    height={40}
                    className="size-7 object-contain"
                  />
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <div className="flex flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-3">
                    <p className="font-medium tracking-tight">
                      {row.org}
                      <span className="text-muted-foreground"> · {row.role}</span>
                    </p>
                    <span className="font-mono text-xs text-muted-foreground tabular-nums sm:ml-auto sm:shrink-0">
                      {row.years}
                    </span>
                  </div>
                  {row.note && (
                    <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                      {row.note}
                    </p>
                  )}
                </div>
              </RevealOnView>
            ))}
          </ol>
          <p className="mt-6 text-sm text-muted-foreground">
            Ivey Business School at Western University.
          </p>
        </section>
      </div>
    </div>
  );
}

import Image from "next/image";
import { Manrope } from "next/font/google";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { listContent, formatDate } from "@/lib/content";
import { listSubstackPosts } from "@/lib/substack";
import { SiteLink } from "./_components/site-link";
import { RevealOnView } from "./_components/reveal-on-view";
import { AnimatedHeading } from "./_components/animated-heading";
import { ConcreteWall } from "./_components/concrete-wall/concrete-wall";
import { WallClock } from "./_components/concrete-wall/wall-clock";

// The hero headline gets its own face. Manrope was hand-picked over Geist for the
// headline only; body and labels stay on Geist / Geist Mono from the root layout.
const headline = Manrope({
  subsets: ["latin"],
  weight: "800",
  display: "swap",
});

// Writing and podcast lists come from the filesystem, but keep the page fresh
// on the same cadence as the rest of the site.
export const revalidate = 300;

const LINKEDIN_URL = "https://www.linkedin.com/in/bertomill";
const AUCCTUS_URL = "https://aucctus.com";
const MAKERSLOUNGE_URL = "https://makerslounge.ca";

/** The three things I'm about, in the order I'd explain them to a stranger. */
const PILLARS = [
  {
    label: "Go-to-market",
    title: "Aucctus",
    role: "Go-to-Market Lead",
    description:
      "Aucctus helps Fortune 500 innovation teams find, test and launch new ideas with AI agents. I run enterprise pipeline and discovery, and carry what customers say back into the product.",
    href: AUCCTUS_URL,
    external: true,
  },
  {
    label: "Community",
    title: "MakersLounge",
    role: "Founder",
    description:
      "A Toronto community of founders and builders using AI in their businesses. Monthly demo nights, online workshops, and a matching app for finding collaborators.",
    href: MAKERSLOUNGE_URL,
    external: true,
  },
  {
    label: "Building",
    title: "Cael",
    role: "Personal agent",
    description:
      "A side project that runs parts of my life: goals, reading, training and calendar in one place. You can ask it about my work directly.",
    href: "/chat",
    external: false,
  },
] as const;

/** Where I've worked, most recent first. Roles shorter than a few months are folded in. */
const EXPERIENCE = [
  { years: "2026 –", role: "Go-to-Market Lead", org: "Aucctus" },
  { years: "2025 – 2026", role: "AI Solutions & GTM Consultant", org: "KPMG" },
  {
    years: "2025 – 2026",
    role: "Teaching Assistant, MMA capstones",
    org: "Ivey Business School",
  },
  { years: "2025 – 2026", role: "AI Coach", org: "Leland" },
  { years: "2023 – 2025", role: "Innovation Strategy Consultant", org: "CIBC" },
  {
    years: "2022 – 2023",
    role: "Technology Consultant",
    org: "Scelta Design & Build",
  },
] as const;

export default async function SiteHomePage() {
  const [writing, episodes] = await Promise.all([
    listSubstackPosts(),
    listContent("podcast"),
  ]);
  const latestWriting = writing[0];
  const latestEpisode = episodes[0];

  return (
    <div className="px-6">
      {/* Intro: the pitch over the concrete wall. Full-viewport, headline pinned
          bottom-left the way koto.com does it. */}
      <div className="relative isolate -mt-16">
        <ConcreteWall />
        <RevealOnView
          as="section"
          intensity="hero"
          staggerChildren
          className="flex min-h-svh flex-col pt-26 pb-6 sm:pt-30 sm:pb-8"
        >
          <div className="mt-auto pt-16">
            <Image
              src="/berto-headshot.jpg"
              alt="Berto Mill"
              width={320}
              height={320}
              priority
              className="mb-6 size-28 rounded-full object-cover shadow-lg ring-1 ring-black/10 sm:size-36 lg:size-44"
            />
            <WallClock className="mb-5" />
            <AnimatedHeading
              className={`${headline.className} text-5xl font-extrabold leading-[1.02] tracking-tight sm:text-7xl lg:text-8xl`}
              lines={["I lead go-to-market for Aucctus,", "a fast-scaling AI startup."]}
            />
          </div>
        </RevealOnView>
      </div>

      {/* About: what I'm about, as three big pillars. */}
      <section id="about-me" className="mx-auto max-w-6xl py-20 sm:py-28">
        <RevealOnView>
          <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            About
          </p>
          <h2
            className={`${headline.className} mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl`}
          >
            Here&rsquo;s what I&rsquo;m about.
          </h2>
        </RevealOnView>

        <ul className="mt-14 grid gap-12 sm:mt-20 md:grid-cols-3 md:gap-10">
          {PILLARS.map((pillar, i) => {
            const inner = (
              <>
                <div className="flex items-baseline justify-between border-t-2 border-foreground pt-4">
                  <span className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                    {pillar.label}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    0{i + 1}
                  </span>
                </div>
                <h3
                  className={`${headline.className} mt-6 flex items-center gap-2 text-3xl font-extrabold tracking-tight transition-colors group-hover:text-primary sm:text-4xl`}
                >
                  {pillar.title}
                  {pillar.external ? (
                    <ArrowUpRightIcon className="size-6 opacity-50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  ) : (
                    <ArrowRightIcon className="size-6 opacity-50 transition-transform group-hover:translate-x-0.5" />
                  )}
                </h3>
                <p className="mt-1 text-sm font-medium text-muted-foreground">
                  {pillar.role}
                </p>
                <p className="mt-5 leading-relaxed text-muted-foreground">
                  {pillar.description}
                </p>
              </>
            );
            return (
              <RevealOnView as="li" delay={i * 0.08} key={pillar.title}>
                {pillar.external ? (
                  <a
                    href={pillar.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group block"
                  >
                    {inner}
                  </a>
                ) : (
                  <SiteLink href={pillar.href} className="group block">
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
            <SiteLink
              href="/chat"
              className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-sm font-medium transition-colors hover:bg-muted"
            >
              Ask Cael about me
            </SiteLink>
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
        <section className="border-t border-border/60 py-14">
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
          <ul className="mt-6 divide-y divide-border/60">
            {EXPERIENCE.map((row) => (
              <li
                key={`${row.org}-${row.role}`}
                className="flex flex-col gap-1 py-3.5 sm:flex-row sm:items-baseline sm:gap-6"
              >
                <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground tabular-nums">
                  {row.years}
                </span>
                <span className="font-medium tracking-tight">{row.role}</span>
                <span className="text-muted-foreground sm:ml-auto sm:text-right">
                  {row.org}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-6 text-sm text-muted-foreground">
            Ivey Business School at Western University.
          </p>
        </section>
      </div>
    </div>
  );
}

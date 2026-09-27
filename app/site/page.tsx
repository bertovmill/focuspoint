import Image from "next/image";
import { Manrope } from "next/font/google";
import { ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { listContent, formatDate } from "@/lib/content";
import { listSubstackPosts } from "@/lib/substack";
import { SiteLink } from "./_components/site-link";
import { RevealOnView } from "./_components/reveal-on-view";
import { AnimatedHeading } from "./_components/animated-heading";
import { GlassSculpture } from "./_components/glass-sculpture/glass-sculpture";
import { ConcreteWall } from "./_components/concrete-wall/concrete-wall";

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

/** The things I spend my weeks on, in the order I'd explain them to a stranger. */
const WORK = [
  {
    eyebrow: "Now",
    title: "Go-to-Market Lead, Aucctus",
    description:
      "Aucctus helps Fortune 500 innovation teams find, test and launch new ideas with AI agents. I run enterprise pipeline and discovery, and carry what customers say back into the product.",
    href: AUCCTUS_URL,
    external: true,
  },
  {
    eyebrow: "Community",
    title: "Founder, MakersLounge",
    description:
      "A Toronto community of founders and builders using AI in their businesses. Monthly demo nights, online workshops, and a matching app for finding collaborators.",
    href: MAKERSLOUNGE_URL,
    external: true,
  },
  {
    eyebrow: "Building",
    title: "Cael, a personal agent",
    description:
      "A side project that runs parts of my life: goals, reading, training and calendar in one place. You can ask it about my work directly.",
    href: "/chat",
    external: false,
  },
  {
    eyebrow: "Sharing",
    title: "Writing and a podcast",
    description:
      "Notes on building AI agents that actually get used, plus recorded conversations about what to build next.",
    href: "/writing",
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
      {/* Intro: the pitch on the left, the glass sculpture on the right. Wider
          than the rest of the page so the two sit side by side on desktop. */}
      <div className="relative isolate">
        <ConcreteWall />
        <RevealOnView
          as="section"
          intensity="hero"
          staggerChildren
          className="mx-auto grid max-w-5xl items-center gap-10 py-16 sm:py-20 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:gap-14"
        >
          <div>
            <div className="flex items-center gap-4">
              <Image
                src="/berto-headshot.jpg"
                alt="Berto Mill"
                width={800}
                height={800}
                priority
                sizes="80px"
                className="size-20 rounded-full object-cover ring-1 ring-border"
              />
              <div>
                <p className="font-medium tracking-tight">Berto Mill</p>
                <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                  Toronto
                </p>
              </div>
            </div>

            <AnimatedHeading
              className={`${headline.className} mt-8 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl`}
              lines={["I help enterprises", "innovate with AI."]}
            />

            <p className="mt-6 max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
              I lead go-to-market at{" "}
              <span className="text-foreground">Aucctus</span>, run{" "}
              <span className="text-foreground">MakersLounge</span>, a community
              of founders building with AI. Before this I spent three years in
              AI strategy at KPMG and CIBC.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
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
          </div>

          {/* Live WebGPU glass, transparent over the page. Renders nothing where it can't run. */}
          <GlassSculpture className="h-72 sm:h-96 lg:h-[30rem]" />
        </RevealOnView>
      </div>

      <div className="mx-auto max-w-3xl">
        {/* What I do */}
        <section className="border-t border-border/60 py-14">
          <h2 className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
            What I do
          </h2>
          <ul className="mt-8 grid gap-x-10 gap-y-10 sm:grid-cols-2">
            {WORK.map((item, i) => {
              const inner = (
                <>
                  <p className="font-mono text-xs uppercase tracking-[0.18em] text-primary">
                    {item.eyebrow}
                  </p>
                  <h3 className="mt-2 flex items-center gap-1.5 text-lg font-medium tracking-tight transition-colors group-hover:text-primary">
                    {item.title}
                    {item.external ? (
                      <ArrowUpRightIcon className="size-4 opacity-60" />
                    ) : (
                      <ArrowRightIcon className="size-4 opacity-60" />
                    )}
                  </h3>
                  <p className="mt-2 leading-relaxed text-muted-foreground">
                    {item.description}
                  </p>
                </>
              );
              return (
                <RevealOnView as="li" delay={i * 0.06} key={item.title}>
                  {item.external ? (
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="group block"
                    >
                      {inner}
                    </a>
                  ) : (
                    <SiteLink href={item.href} className="group block">
                      {inner}
                    </SiteLink>
                  )}
                </RevealOnView>
              );
            })}
          </ul>
        </section>

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

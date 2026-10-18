import type { Metadata } from "next";
import { RevealOnView } from "../_components/reveal-on-view";
import { AnimatedHeading } from "../_components/animated-heading";
import { ConcreteWall } from "../_components/concrete-wall/concrete-wall";
import { SubscribeForm } from "../_components/subscribe-form";
import { RacePicker } from "./race-picker";
import {
  HYROX_RESULTS,
  HYROX_UPCOMING,
  daysUntil,
  formatRaceDate,
  hyroxSeconds,
  torontoToday,
  type HyroxResult,
  type HyroxUpcoming,
} from "@/lib/hyrox";

const TAGLINE = ["HYROX results,", "from the official timing."];

export const metadata: Metadata = {
  title: "Fitness",
  description: "Berto Mill's HYROX results, with every run and station split.",
};

// "Up next" counts down to race day, so re-render hourly rather than freezing at build.
export const revalidate = 3600;

/* Small uppercase mono label, the same one the nav and About page use. */
const LABEL = "font-mono text-xs uppercase tracking-[0.18em]";
const display = "font-sans font-semibold text-foreground/90";

export default function FitnessPage() {
  const today = torontoToday();
  // A race stays here until its result is added, so it never just vanishes on race day.
  const resultSlugs = new Set(HYROX_RESULTS.map((r) => r.slug));
  const upcoming = HYROX_UPCOMING.filter((race) => !resultSlugs.has(race.slug));

  const best = HYROX_RESULTS.reduce<HyroxResult | null>(
    (fastest, r) => (!fastest || hyroxSeconds(r.total) < hyroxSeconds(fastest.total) ? r : fastest),
    null,
  );
  const wins = HYROX_RESULTS.filter((r) => r.rank === 1).length;

  const jumpTo = [
    ...(upcoming.length > 0 ? [{ id: "up-next", label: "Up next" }] : []),
    ...HYROX_RESULTS.map((r) => ({ id: r.slug, label: r.event.replace(/^HYROX /, "") })),
  ];

  return (
    <div className="px-6">
      {/* Hero, the same lit concrete wall and title/tagline split as /about. */}
      <div className="relative isolate -mt-[4.5rem] pt-[4.5rem]">
        <ConcreteWall />
        <RevealOnView
          as="section"
          intensity="hero"
          staggerChildren
          className="mx-auto max-w-6xl py-16 sm:py-24"
        >
          <div className="grid gap-8 lg:grid-cols-2 lg:gap-14">
            <div>
              <h1 className="text-3xl font-medium tracking-tight sm:text-4xl">Fitness</h1>
              {/* The same sign-up as the homepage hero, /writing and /podcast. */}
              <div id="fitness-newsletter" className="mt-8 max-w-md">
                <p className="mb-3 font-mono text-xs uppercase tracking-[0.18em] text-foreground/60">
                  Get what I&apos;m learning building AI, by email
                </p>
                <SubscribeForm source="fitness" />
              </div>
            </div>
            <AnimatedHeading
              as="p"
              className="text-3xl leading-snug tracking-tight text-muted-foreground sm:text-4xl"
              lines={TAGLINE}
            />
          </div>

          <nav
            aria-label="Jump to"
            className="mt-10 flex flex-wrap items-baseline gap-x-8 gap-y-3 lg:ml-auto lg:w-1/2"
          >
            <span className={`${LABEL} text-muted-foreground`}>(Jump to)</span>
            {jumpTo.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`${LABEL} text-foreground transition-colors hover:text-primary`}
              >
                {s.label}
              </a>
            ))}
          </nav>
        </RevealOnView>
      </div>

      <div className="mx-auto max-w-6xl">
        {upcoming.length > 0 && (
          <section id="up-next" className="scroll-mt-24 border-t border-border/60">
            <RevealOnView className="py-14 lg:grid lg:grid-cols-2 lg:gap-14">
              <h2 className={`${LABEL} text-muted-foreground`}>Up next</h2>
              <ul className="mt-6 space-y-8 lg:mt-0">
                {upcoming.map((race) => (
                  <UpcomingRace key={race.slug} race={race} today={today} />
                ))}
              </ul>
            </RevealOnView>
          </section>
        )}

        <section id="hyrox-results" className="scroll-mt-24 border-t border-border/60">
          <RacePicker
            results={HYROX_RESULTS}
            header={
              <RevealOnView>
                <h2 className={`${LABEL} text-muted-foreground`}>Results</h2>
                {best && (
                  <dl className="mt-6 grid max-w-sm grid-cols-3 gap-4">
                    <Stat label="Races" value={String(HYROX_RESULTS.length)} />
                    <Stat label="Wins" value={String(wins)} />
                    <Stat label="Best" value={best.total} />
                  </dl>
                )}
              </RevealOnView>
            }
          />
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-t border-border/60 pt-3">
      <dt className={`${LABEL} text-muted-foreground`}>{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{value}</dd>
    </div>
  );
}

function UpcomingRace({ race, today }: { race: HyroxUpcoming; today: string }) {
  const days = daysUntil(race.date, today);
  const when =
    days > 1 ? `In ${days} days` : days === 1 ? "Tomorrow" : days === 0 ? "Race day" : "Result coming";

  return (
    <li>
      <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground pt-4">
        <span className={`${LABEL} text-primary`}>{when}</span>
        <span className="font-mono text-xs text-muted-foreground">{formatRaceDate(race.date)}</span>
      </div>
      <p className={`${display} mt-6 text-3xl tracking-[-0.035em] sm:text-4xl`}>{race.event}</p>
      <p className="mt-2 text-muted-foreground">
        {race.division} · {race.ageGroup}
      </p>
    </li>
  );
}

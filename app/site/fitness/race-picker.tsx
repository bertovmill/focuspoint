"use client";

import { useEffect, useState, type ReactNode } from "react";
import { ArrowUpRightIcon } from "lucide-react";
import { RevealOnView } from "../_components/reveal-on-view";
import { HYROX_STATIONS, formatRaceDate, ordinal, type HyroxResult } from "@/lib/hyrox";

/* Small uppercase mono label, the same one the nav and About page use. */
const LABEL = "font-mono text-xs uppercase tracking-[0.18em]";
const display = "font-sans font-semibold text-foreground/90";

const shortName = (r: HyroxResult) => r.event.replace(/^HYROX /, "");

/**
 * The race list on the left, one race's splits on the right. The URL hash names the
 * race (bertomill.com/fitness#hyrox-ottawa-2026), so the hero's jump links and shared
 * links open the right one.
 */
export function RacePicker({ results, header }: { results: readonly HyroxResult[]; header: ReactNode }) {
  const [slug, setSlug] = useState(results[0]?.slug);

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash.slice(1);
      if (results.some((r) => r.slug === hash)) setSlug(hash);
    };
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, [results]);

  const select = (next: string) => {
    setSlug(next);
    // replaceState, not location.hash, so picking a race doesn't jump the page.
    window.history.replaceState(null, "", `#${next}`);
  };

  const result = results.find((r) => r.slug === slug) ?? results[0];
  if (!result) return null;

  return (
    <div className="relative py-14 lg:grid lg:grid-cols-2 lg:gap-14">
      {/* Targets for #slug links: land on the results section, the picker opens the race. */}
      <div className="absolute">
        {results.map((r) => (
          <span key={r.slug} id={r.slug} className="block scroll-mt-24" aria-hidden />
        ))}
      </div>

      <div className="lg:sticky lg:top-24 lg:self-start">
        {header}
        <ul aria-label="Races" className="mt-10">
        {results.map((r) => {
          const active = r.slug === result.slug;
          return (
            <li key={r.slug}>
              <button
                type="button"
                onClick={() => select(r.slug)}
                aria-current={active ? "true" : undefined}
                aria-controls="race-detail"
                className={`group flex w-full items-baseline justify-between gap-4 border-t py-4 text-left transition-colors ${
                  active ? "border-foreground" : "border-border/60 hover:border-foreground/40"
                }`}
              >
                <span>
                  <span
                    className={`${LABEL} block transition-colors ${
                      active ? "text-primary" : "text-muted-foreground group-hover:text-foreground"
                    }`}
                  >
                    {shortName(r)}
                  </span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {r.partner ? "Doubles" : r.division}
                  </span>
                </span>
                <span className="text-right tabular-nums">
                  <span
                    className={`block text-xl font-semibold tracking-tight transition-colors ${
                      active ? "text-foreground" : "text-foreground/60 group-hover:text-foreground"
                    }`}
                  >
                    {r.total}
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">{ordinal(r.rank)}</span>
                </span>
              </button>
            </li>
          );
        })}
        </ul>
      </div>

      <RaceDetail key={result.slug} result={result} />
    </div>
  );
}

function RaceDetail({ result }: { result: HyroxResult }) {
  return (
    <article id="race-detail" aria-live="polite" className="mt-10 lg:mt-0">
      <RevealOnView>
        <div className="flex items-baseline justify-between gap-4 border-t-2 border-foreground pt-4">
          <span className={`${LABEL} text-primary`}>{shortName(result)}</span>
          <span className="font-mono text-xs text-muted-foreground">{formatRaceDate(result.date)}</span>
        </div>

        <div className="mt-6 flex items-end justify-between gap-6">
          <p className={`${display} text-5xl tracking-[-0.045em] tabular-nums sm:text-6xl`}>
            {result.total}
          </p>
          <div className="text-right">
            <p className="text-2xl font-semibold tracking-tight">{ordinal(result.rank)}</p>
            <p className="font-mono text-xs text-muted-foreground">
              of {result.fieldSize} {result.fieldLabel}
            </p>
          </div>
        </div>
        <p className="mt-2 text-muted-foreground">
          {result.division}
          {result.partner ? ` with ${result.partner}` : ""} · {result.ageGroup}
        </p>

        <table className="mt-8 w-full text-sm tabular-nums">
          <caption className="sr-only">
            {result.event} splits: each 1 km run and the station after it
          </caption>
          <thead>
            <tr className={`${LABEL} text-left text-muted-foreground [&>th]:pb-3 [&>th]:font-normal [&>th]:px-2 [&>th:first-child]:pl-0 [&>th:last-child]:pr-0`}>
              <th scope="col" className="w-8">#</th>
              <th scope="col">Run</th>
              <th scope="col">Station</th>
              <th scope="col" className="text-right">Time</th>
              <th scope="col" className="text-right">
                <abbr title="Place on that station" className="no-underline">Place</abbr>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60 border-y border-border/60">
            {result.splits.map((split, i) => {
              const station = HYROX_STATIONS[i];
              return (
                <tr
                  key={station.name}
                  className="[&>td]:px-2 [&>td]:py-2.5 [&>td:first-child]:pl-0 [&>td:last-child]:pr-0"
                >
                  <td className="font-mono text-xs text-muted-foreground">{String(i + 1).padStart(2, "0")}</td>
                  <td>{split.run}</td>
                  <td>
                    {station.name}
                    <span className="ml-1.5 whitespace-nowrap text-xs text-muted-foreground">{station.distance}</span>
                  </td>
                  <td className="text-right">{split.station}</td>
                  <td
                    className={`text-right ${split.stationRank <= 3 ? "font-semibold text-primary" : "text-muted-foreground"}`}
                  >
                    {ordinal(split.stationRank)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2 font-mono text-xs text-muted-foreground">
          <span>
            Run total {result.runTotal} · Roxzone {result.roxzone}
          </span>
          <a
            href={result.resultUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 uppercase tracking-[0.18em] text-foreground transition-colors hover:text-primary"
          >
            Official result
            <ArrowUpRightIcon className="size-3.5" />
          </a>
        </div>
      </RevealOnView>
    </article>
  );
}

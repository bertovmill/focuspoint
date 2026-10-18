"use client";

// "In the room": the photos from my LinkedIn posts as one big row that swipes
// sideways (scroll-snap), with arrow buttons for a mouse and a year filter.
// The row bleeds to the right edge of the window so the next photo peeks in.
// A photo opens its story in a dialog; the open one lives in #moment-<slug>,
// so a story can be linked to.

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import { MOMENTS } from "@/lib/site-moments";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";

const HASH_PREFIX = "#moment-";
const LINKEDIN_ACTIVITY_URL = "https://www.linkedin.com/in/bertomill/recent-activity/images/";

/** Newest first. */
const SORTED = [...MOMENTS].sort((a, b) => b.date.localeCompare(a.date));
const YEARS = [...new Set(SORTED.map((m) => m.date.slice(0, 4)))];
const FILTERS = ["all", ...YEARS];

function formatMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", { month: "short", year: "numeric" });
}

export function MomentsCarousel({
  children,
}: {
  /** Section heading, laid out opposite the controls. */
  children?: React.ReactNode;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [filter, setFilter] = useState("all");
  const [edges, setEdges] = useState({ start: true, end: false });
  const [open, setOpen] = useState<string | null>(null);

  const shown = useMemo(
    () => (filter === "all" ? SORTED : SORTED.filter((m) => m.date.startsWith(filter))),
    [filter],
  );
  const current = open ? MOMENTS.find((m) => m.slug === open) : undefined;

  const measureEdges = useCallback(() => {
    const track = trackRef.current;
    if (!track) return;
    setEdges({
      start: track.scrollLeft <= 4,
      end: track.scrollLeft + track.clientWidth >= track.scrollWidth - 4,
    });
  }, []);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollTo({ left: 0 });
    measureEdges();
    track.addEventListener("scroll", measureEdges, { passive: true });
    window.addEventListener("resize", measureEdges);
    return () => {
      track.removeEventListener("scroll", measureEdges);
      window.removeEventListener("resize", measureEdges);
    };
  }, [shown, measureEdges]);

  // One card's width per press, so the row lands on a snap point.
  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    const card = track?.querySelector("li");
    if (!track || !card) return;
    const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
    track.scrollBy({ left: direction * (card.clientWidth + gap), behavior: "smooth" });
  };

  const step = (direction: 1 | -1) => {
    if (!open || shown.length < 2) return;
    const index = shown.findIndex((m) => m.slug === open);
    setOpen(shown[(index + direction + shown.length) % shown.length]!.slug);
  };

  // Arriving on #moment-<slug>: bring the section into view and open that photo.
  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith(HASH_PREFIX)) return;
    const slug = hash.slice(HASH_PREFIX.length);
    if (!MOMENTS.some((m) => m.slug === slug)) return;
    trackRef.current?.scrollIntoView({ block: "center" });
    setOpen(slug);
  }, []);

  useEffect(() => {
    const url = open ? `${HASH_PREFIX}${open}` : window.location.pathname + window.location.search;
    if (open ? window.location.hash !== url : window.location.hash.startsWith(HASH_PREFIX)) {
      window.history.replaceState(null, "", url);
    }
  }, [open]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div>{children}</div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Filter photos by year" className="flex rounded-full border border-border p-0.5">
            {FILTERS.map((value) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={filter === value}
                onClick={() => setFilter(value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  filter === value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {value === "all" ? "All" : value}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => page(-1)}
            disabled={edges.start}
            aria-label="Previous photos"
            className="hidden rounded-full border border-border p-2.5 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent sm:block"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => page(1)}
            disabled={edges.end}
            aria-label="Next photos"
            className="hidden rounded-full border border-border p-2.5 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent sm:block"
          >
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Full-bleed: starts on the column's left edge, runs off the window's right. */}
      <ul
        ref={trackRef}
        aria-label="Talks, hackathons and events"
        className="mx-[calc(50%-50vw)] mt-8 flex snap-x snap-mandatory gap-5 overflow-x-auto overscroll-x-contain px-[max(1.5rem,calc(50vw-36rem))] scroll-px-[max(1.5rem,calc(50vw-36rem))] pb-4 [scrollbar-width:none] sm:mt-10 sm:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {shown.map((moment, i) => (
          <li key={moment.slug} className="w-[82vw] shrink-0 snap-start sm:w-[26rem] lg:w-[30rem]">
            <button
              type="button"
              onClick={() => setOpen(moment.slug)}
              aria-label={`${moment.title}, ${moment.place}, ${formatMonth(moment.date)}. Open the post`}
              className="group block w-full text-left"
            >
              <div className="relative aspect-[4/3] overflow-hidden rounded-3xl bg-muted ring-1 ring-black/5">
                <Image
                  src={moment.src}
                  alt={`${moment.title}, ${moment.place}`}
                  fill
                  priority={i < 2}
                  sizes="(min-width: 1024px) 30rem, (min-width: 640px) 26rem, 82vw"
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                />
              </div>
              <p className="mt-4 text-lg font-medium leading-snug tracking-tight transition-colors group-hover:text-primary sm:text-xl">
                {moment.title}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                {moment.place} · {formatMonth(moment.date)}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!current} onOpenChange={(next) => !next && setOpen(null)}>
        {current && (
          <DialogContent
            className="flex max-h-[min(88svh,40rem)] flex-col gap-0 overflow-hidden rounded-3xl p-0 sm:max-w-4xl md:flex-row"
            onKeyDown={(event) => {
              if (event.key === "ArrowRight") step(1);
              if (event.key === "ArrowLeft") step(-1);
            }}
          >
            <div className="relative aspect-[4/3] shrink-0 bg-muted md:aspect-auto md:w-[54%]">
              <Image
                src={current.src}
                alt={`${current.title}, ${current.place}`}
                fill
                sizes="(min-width: 900px) 480px, 100vw"
                className="object-cover"
              />
            </div>
            <div className="flex min-h-0 flex-1 flex-col p-6">
              <p className="font-mono text-xs uppercase tracking-[0.18em] text-muted-foreground">
                {current.place} · {formatMonth(current.date)}
              </p>
              <DialogTitle className="mt-2 pr-8 text-2xl font-semibold leading-tight tracking-[-0.02em]">
                {current.title}
              </DialogTitle>
              <DialogDescription className="mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain whitespace-pre-line pr-1 text-sm leading-relaxed text-foreground/80">
                {current.post}
              </DialogDescription>
              <div className="mt-3 flex items-center justify-between gap-3 border-t border-border/60 pt-3">
                <a
                  href={LINKEDIN_ACTIVITY_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 text-sm font-medium text-primary hover:text-foreground"
                >
                  More on LinkedIn
                  <ArrowUpRightIcon className="size-4" />
                </a>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => step(-1)}
                    aria-label="Previous photo"
                    className="rounded-full border border-border p-2 transition-colors hover:bg-muted"
                  >
                    <ArrowLeftIcon className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => step(1)}
                    aria-label="Next photo"
                    className="rounded-full border border-border p-2 transition-colors hover:bg-muted"
                  >
                    <ArrowRightIcon className="size-4" />
                  </button>
                </div>
              </div>
            </div>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

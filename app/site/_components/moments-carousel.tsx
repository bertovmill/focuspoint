"use client";

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftIcon, ArrowRightIcon, ArrowUpRightIcon } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Moment } from "@/lib/site-moments";

const LINKEDIN_ACTIVITY_URL =
  "https://www.linkedin.com/in/bertomill/recent-activity/images/";
const HASH_PREFIX = "#moment-";

function formatMonth(date: string) {
  const [y, m] = date.split("-").map(Number);
  return new Date(y, m - 1).toLocaleString("en-US", {
    month: "short",
    year: "numeric",
  });
}

/**
 * A horizontal, snap-scrolling strip of photos. Clicking one opens the LinkedIn
 * post it came from. The open photo is mirrored into the URL hash
 * (#moment-<slug>) so a specific story can be linked to directly.
 */
export function MomentsCarousel({
  moments,
  children,
}: {
  moments: Moment[];
  /** Section heading, laid out opposite the scroll buttons. */
  children?: React.ReactNode;
}) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [openSlug, setOpenSlug] = useState<string | null>(null);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const open = moments.find((m) => m.slug === openSlug) ?? null;

  const setOpen = useCallback((slug: string | null) => {
    setOpenSlug(slug);
    const url = slug
      ? `${HASH_PREFIX}${slug}`
      : window.location.pathname + window.location.search;
    window.history.replaceState(null, "", url);
  }, []);

  useEffect(() => {
    const hash = window.location.hash;
    if (hash.startsWith(HASH_PREFIX)) {
      const slug = hash.slice(HASH_PREFIX.length);
      if (moments.some((m) => m.slug === slug)) setOpenSlug(slug);
    }
  }, [moments]);

  const updateEdges = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setAtStart(el.scrollLeft <= 4);
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    updateEdges();
    window.addEventListener("resize", updateEdges);
    return () => window.removeEventListener("resize", updateEdges);
  }, [updateEdges]);

  const scrollByPage = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: "smooth" });
  };

  const step = (dir: 1 | -1) => {
    if (!open) return;
    const i = moments.findIndex((m) => m.slug === open.slug);
    setOpen(moments[(i + dir + moments.length) % moments.length].slug);
  };

  return (
    <>
      <div className="flex items-end justify-between gap-4">
        <div>{children}</div>
        <div className="hidden gap-2 sm:flex">
          <button
            type="button"
            onClick={() => scrollByPage(-1)}
            disabled={atStart}
            aria-label="Previous photos"
            className="rounded-full border border-border p-2.5 transition-colors hover:bg-muted disabled:opacity-30"
          >
            <ArrowLeftIcon className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => scrollByPage(1)}
            disabled={atEnd}
            aria-label="Next photos"
            className="rounded-full border border-border p-2.5 transition-colors hover:bg-muted disabled:opacity-30"
          >
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      <ul
        ref={trackRef}
        onScroll={updateEdges}
        className="-mx-6 mt-6 flex snap-x snap-mandatory gap-4 overflow-x-auto scroll-px-6 px-6 pb-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {moments.map((m, i) => (
          <li
            key={m.slug}
            className="w-[78vw] shrink-0 snap-start sm:w-[340px] lg:w-[380px]"
          >
            <button
              type="button"
              onClick={() => setOpen(m.slug)}
              className="group block w-full text-left"
            >
              <div className="relative aspect-[4/5] overflow-hidden rounded-xl bg-muted">
                <Image
                  src={m.src}
                  alt={`${m.title}, ${m.place}`}
                  fill
                  sizes="(min-width: 1024px) 380px, (min-width: 640px) 340px, 78vw"
                  priority={i < 3}
                  className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                />
              </div>
              <p className="mt-3 font-medium leading-snug">{m.title}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {m.place} · {formatMonth(m.date)}
              </p>
            </button>
          </li>
        ))}
      </ul>

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        {open && (
          <DialogContent
            className="max-h-[90svh] gap-0 overflow-y-auto p-0 sm:max-w-3xl"
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") step(1);
              if (e.key === "ArrowLeft") step(-1);
            }}
          >
            <div className="relative bg-muted">
              <Image
                src={open.src}
                alt={`${open.title}, ${open.place}`}
                width={open.width}
                height={open.height}
                sizes="(min-width: 640px) 768px, 100vw"
                className="mx-auto max-h-[60svh] w-auto object-contain"
              />
            </div>
            <div className="p-6">
              <DialogTitle className="text-xl leading-snug">
                {open.title}
              </DialogTitle>
              <DialogDescription className="mt-1">
                {open.place} · {formatMonth(open.date)}
              </DialogDescription>
              <p className="mt-5 whitespace-pre-line leading-relaxed text-foreground/85">
                {open.post}
              </p>
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
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
    </>
  );
}

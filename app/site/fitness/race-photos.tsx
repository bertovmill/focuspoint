"use client";

// Race-day photos from HYROX Ottawa as one row that swipes sideways (scroll-snap),
// with arrow buttons for a mouse. Same full-bleed row as the homepage moments
// carousel; every photo keeps one height so portrait and landscape shots sit together.

import type React from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react";

const PHOTOS = [
  { slug: "podium", alt: "Second place on the Doubles Mixed podium", width: 1200, height: 1600 },
  { slug: "finish-line", alt: "Crossing the finish line", width: 360, height: 540 },
  { slug: "row-closeup", alt: "On the rower", width: 1200, height: 799 },
  { slug: "sandbag-lunges", alt: "Sandbag lunges", width: 360, height: 540 },
  { slug: "skierg-wait", alt: "On the SkiErg", width: 799, height: 1200 },
  { slug: "run-skierg-hall", alt: "Running out of the SkiErg hall", width: 1200, height: 799 },
  { slug: "run-together", alt: "Running a lap", width: 360, height: 540 },
  { slug: "row-coached", alt: "Rowing, with my partner calling the pace", width: 360, height: 540 },
  { slug: "run-race-for-impact", alt: "Running past the Race for Impact boards", width: 360, height: 540 },
].map((p) => ({ ...p, src: `/site-art/hyrox-ottawa-${p.slug}.jpg` }));

export function RacePhotos({ children }: { children?: React.ReactNode }) {
  const trackRef = useRef<HTMLUListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: false });

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
    measureEdges();
    track.addEventListener("scroll", measureEdges, { passive: true });
    window.addEventListener("resize", measureEdges);
    return () => {
      track.removeEventListener("scroll", measureEdges);
      window.removeEventListener("resize", measureEdges);
    };
  }, [measureEdges]);

  // Photos differ in width, so page by most of the visible row rather than one card.
  const page = (direction: 1 | -1) => {
    const track = trackRef.current;
    if (!track) return;
    track.scrollBy({ left: direction * track.clientWidth * 0.7, behavior: "smooth" });
  };

  const arrow =
    "hidden rounded-full border border-border p-2.5 transition-colors hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent sm:block";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div>{children}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => page(-1)} disabled={edges.start} aria-label="Previous photos" className={arrow}>
            <ArrowLeftIcon className="size-4" />
          </button>
          <button type="button" onClick={() => page(1)} disabled={edges.end} aria-label="Next photos" className={arrow}>
            <ArrowRightIcon className="size-4" />
          </button>
        </div>
      </div>

      {/* Full-bleed: starts on the column's left edge, runs off the window's right. */}
      <ul
        ref={trackRef}
        aria-label="HYROX Ottawa race photos"
        className="mx-[calc(50%-50vw)] mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-[max(1.5rem,calc(50vw-36rem))] scroll-px-[max(1.5rem,calc(50vw-36rem))] pb-4 [scrollbar-width:none] sm:gap-5 [&::-webkit-scrollbar]:hidden"
      >
        {PHOTOS.map((photo, i) => (
          <li
            key={photo.slug}
            className="relative h-80 shrink-0 snap-start overflow-hidden rounded-3xl bg-muted ring-1 ring-black/5 sm:h-[26rem]"
            style={{ aspectRatio: `${photo.width} / ${photo.height}` }}
          >
            <Image
              src={photo.src}
              alt={`${photo.alt}, HYROX Ottawa`}
              fill
              priority={i < 2}
              sizes="(min-width: 640px) 36rem, 90vw"
              className="object-cover"
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

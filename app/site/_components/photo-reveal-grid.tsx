"use client";

// A wall of square tiles, each hiding a photo under a cover the colour of the
// page (after netic.ai/company). With a mouse, hovering a tile drops its cover
// in 0.1s; once the pointer leaves, the cover waits 3s and fades back over
// 0.3s, so a sweep across the grid leaves a trail that slowly closes. Touch
// screens can't hover, so there the covers lift one by one, in random order,
// the first time the grid scrolls into view.

import { useEffect, useRef } from "react";
import Image from "next/image";
import { MOMENTS } from "@/lib/site-moments";

/** 12 columns x 3 rows on desktop. Adjacent tiles never repeat a photo. */
const TILES = Array.from({ length: 36 }, (_, i) => MOMENTS[i % MOMENTS.length]);

export function PhotoRevealGrid() {
  const gridRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const grid = gridRef.current;
    if (!grid || window.matchMedia("(hover: hover)").matches) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const timers: number[] = [];
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      observer.disconnect();
      const covers = [...grid.querySelectorAll<HTMLElement>("[data-cover]")];
      for (let i = covers.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [covers[i], covers[j]] = [covers[j], covers[i]];
      }
      covers.forEach((cover, i) => {
        timers.push(
          window.setTimeout(
            () => {
              // Skip the desktop's 3s hold; a touch reveal should be immediate.
              cover.style.transition = "opacity 0.1s linear";
              cover.style.opacity = "0";
            },
            reduced ? 0 : i * 120,
          ),
        );
      });
    });
    observer.observe(grid);
    return () => {
      observer.disconnect();
      timers.forEach(clearTimeout);
    };
  }, []);

  return (
    <div ref={gridRef} className="grid grid-cols-6 gap-px lg:grid-cols-12">
      {TILES.map((m, i) => (
        <div key={i} className="group relative aspect-square overflow-hidden bg-muted">
          <Image
            src={m.src}
            alt={m.title}
            fill
            sizes="(min-width: 1024px) 8vw, 17vw"
            className="object-cover"
          />
          <div
            data-cover
            aria-hidden
            className="absolute inset-0 bg-background transition-opacity delay-[3000ms] duration-300 ease-linear group-hover:opacity-0 group-hover:delay-0 group-hover:duration-100"
          />
        </div>
      ))}
    </div>
  );
}

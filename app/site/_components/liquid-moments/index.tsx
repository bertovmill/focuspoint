"use client";

// "In the room": the photos from my LinkedIn posts as a liquid-glass grid,
// after the vgpu "Liquid Layout" example (`npx vgpu examples pull
// liquid-layout`). The DOM cards are real buttons moved by Motion; a WebGPU
// canvas behind them pours one liquid surface under every card, so cards that
// fly past each other bridge and pinch apart.
//
// Browsers without WebGPU (Firefox, most in-app browsers) get the same grid
// and animations with a plain CSS card fill; the canvas only fades in once its
// pipeline is compiled and ticking.

import type React from "react";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { ShuffleIcon } from "lucide-react";
import { cn } from "@/lib/utils";

import { CARDS, GROUPS } from "./cards";
import { createLayoutStore, frameHeight } from "./layout-store";
import { LiquidCards } from "./liquid-cards";
import { createRenderer } from "./renderer";

const FILTERS = [{ value: "all", label: "All" }, ...GROUPS.map((year) => ({ value: year, label: year }))];

export function LiquidMoments({
  children,
}: {
  /** Section heading, laid out opposite the controls. */
  children?: React.ReactNode;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [store] = useState(() => createLayoutStore());
  const filter = useSyncExternalStore(store.subscribe, () => store.getState().filter, () => "all");
  const [glass, setGlass] = useState(false);
  const [width, setWidth] = useState(0);

  // The grid's height follows its width (the page scrolls), so measure the
  // width and size the frame from it before the cards lay out.
  useLayoutEffect(() => {
    const element = frameRef.current;
    if (!element) return;
    const measure = () => setWidth(element.clientWidth);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = rootRef.current;
    if (!canvas || !container || !("gpu" in navigator)) return;

    let live = true;
    const renderer = createRenderer({ canvas, container, store, onFail: () => live && setGlass(false) });
    renderer.ready
      .then(() => {
        // Wait out the first frame, so the glass is drawn before the cards drop their CSS fill.
        requestAnimationFrame(() => requestAnimationFrame(() => live && setGlass(true)));
      })
      .catch(() => {
        // No adapter or a shader that will not compile: keep the CSS cards.
        if (live) setGlass(false);
      });

    return () => {
      live = false;
      renderer.dispose();
      setGlass(false);
    };
  }, [store]);

  return (
    <div ref={rootRef} className="bg-background">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-5">
        <div>{children}</div>
        <div className="flex items-center gap-2">
          <div role="radiogroup" aria-label="Filter photos by year" className="flex rounded-full border border-border p-0.5">
            {FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={filter === option.value}
                onClick={() => store.setFilter(option.value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-sm transition-colors",
                  filter === option.value
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => store.shuffle()}
            aria-label="Shuffle photos"
            className="rounded-full border border-border p-2.5 transition-colors hover:bg-muted"
          >
            <ShuffleIcon className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={frameRef}
        // Bleeds into the page gutter: the grid keeps the column's width and the
        // canvas gets room at the sides for the glass's shadow to fade out.
        className="relative -mx-6 mt-2"
        style={{ height: width > 0 ? frameHeight(width, CARDS.length) : undefined }}
      >
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          className={cn(
            "absolute inset-0 block h-full w-full transition-opacity duration-500",
            glass ? "opacity-100" : "opacity-0",
          )}
        />
        <LiquidCards store={store} glass={glass} />
      </div>
    </div>
  );
}

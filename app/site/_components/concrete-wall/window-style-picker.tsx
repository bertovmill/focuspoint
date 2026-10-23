"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { WINDOW_STYLES, windowRect, type WindowStyle } from "./scene";
import { windowStyleStore } from "./window-style-store";

/**
 * The little frosted pill on the window's glass that swaps the window for
 * another style. Sits at the foot of the glass, in the middle, between the
 * jar on the left and the money tree on the right; every style has a flat
 * bottom, so it stays put under the pointer as you click through them.
 *
 * Full-bleed over the hero like the desk layer, so it can find the window by
 * the same `windowRect`; only the pill takes the pointer.
 */
export function WindowStylePicker() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [shape, setShape] = useState<{ width: number; height: number } | null>(
    null,
  );
  const [shown, setShown] = useState(false);
  const style = useSyncExternalStore(
    windowStyleStore.subscribe,
    windowStyleStore.get,
    windowStyleStore.getServer,
  );

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setShape({ width, height });
    });
    observer.observe(root);
    // Comes in once the wall has had time to paint the window it sits on.
    const id = window.setTimeout(() => setShown(true), 1400);
    return () => {
      observer.disconnect();
      window.clearTimeout(id);
    };
  }, []);

  const rect = shape
    ? windowRect(shape.width / shape.height, shape.width)
    : null;
  const index = WINDOW_STYLES.findIndex((s) => s.id === style.id);
  // A phone's small window only has room for the drawing; tap it for the next style.
  const compact = rect && shape ? rect.hw * 2 * shape.width < 360 : false;

  return (
    <div
      ref={rootRef}
      className="pointer-events-none absolute inset-y-0 left-1/2 z-20 w-screen -translate-x-1/2 overflow-hidden"
    >
      {rect && shape && (
        <div
          className={cn(
            "absolute -translate-x-1/2 -translate-y-full transition-opacity duration-700",
            shown ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          style={{
            left: rect.x * shape.width,
            top: (rect.y + rect.hh) * shape.height - 12,
          }}
        >
          <div
            role="group"
            aria-label="Window style"
            className={cn(
              "pointer-events-auto flex items-center gap-0.5 rounded-full text-[11px]",
              compact ? "h-7 px-0.5" : "h-8 px-1",
              "font-medium tracking-wide text-neutral-800",
              "bg-white/60 shadow-[0_4px_14px_rgba(20,16,10,0.18)] ring-1 ring-black/10 backdrop-blur-md backdrop-saturate-150",
              "opacity-80 transition-opacity duration-300 hover:opacity-100 focus-within:opacity-100",
              "dark:bg-neutral-900/55 dark:text-neutral-100 dark:ring-white/15",
            )}
          >
            {!compact && (
              <button
                type="button"
                aria-label="Previous window style"
                onClick={() => windowStyleStore.cycle(-1)}
                className="grid size-6 place-items-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronLeft className="size-3.5" />
              </button>
            )}
            <button
              type="button"
              aria-label={`Window: ${style.label}. Show the next style`}
              onClick={() => windowStyleStore.cycle(1)}
              className="flex h-6 items-center gap-1.5 rounded-full px-1.5 transition-colors hover:bg-black/5 dark:hover:bg-white/10"
            >
              <WindowGlyph style={style} />
              {!compact && (
                <>
                  <span className="whitespace-nowrap">{style.label}</span>
                  <span className="tabular-nums text-neutral-500 dark:text-neutral-400">
                    {index + 1}/{WINDOW_STYLES.length}
                  </span>
                </>
              )}
            </button>
            {!compact && (
              <button
                type="button"
                aria-label="Next window style"
                onClick={() => windowStyleStore.cycle(1)}
                className="grid size-6 place-items-center rounded-full transition-colors hover:bg-black/5 dark:hover:bg-white/10"
              >
                <ChevronRight className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/** A tiny drawing of the window style: its outline and glazing bars. */
function WindowGlyph({ style }: { style: WindowStyle }) {
  const w = 16;
  const h = 13;
  const rise = style.kind === 1 ? style.rise * h : 0;
  const outline =
    rise > 0
      ? `M0.75 ${h - 0.75} V${rise} Q${w / 2} ${-rise * 0.9} ${w - 0.75} ${rise} V${h - 0.75} Z`
      : `M0.75 0.75 H${w - 0.75} V${h - 0.75} H0.75 Z`;
  const bars: string[] = [];
  for (let i = 1; i < style.cols; i++)
    bars.push(`M${(w * i) / style.cols} ${rise} V${h}`);
  const rowH = (h - rise) / style.rows;
  for (let i = rise > 0 ? 0 : 1; i < style.rows; i++)
    bars.push(`M0 ${rise + rowH * i} H${w}`);
  if (rise > 0) bars.push(`M${w / 2} ${rise} V${0.5}`);
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      className="h-3 w-[15px] shrink-0"
      fill="none"
      stroke="currentColor"
      aria-hidden
    >
      <path d={outline} strokeWidth={1.3} strokeLinejoin="round" />
      <path d={bars.join(" ")} strokeWidth={0.8} />
    </svg>
  );
}

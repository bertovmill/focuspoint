"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import ReactGridLayout, { useContainerWidth, type Layout } from "react-grid-layout";
import "react-grid-layout/css/styles.css";
import { GripVerticalIcon, RotateCcwIcon } from "lucide-react";
import { toast } from "sonner";
import type { HomeBlockPosition } from "@/lib/home-layout";
import { cn } from "@/lib/utils";

/**
 * Home as building blocks (his ask, 2026-10-23): every block sits on a 12-column
 * grid, dragged by the grip on its top-left and resized from the bottom-right
 * corner. The layout saves to /api/settings/home-layout. Narrow screens skip the
 * grid and stack the blocks in the layout's reading order (top to bottom, then
 * left to right), so the phone follows what he arranged on desktop.
 */

export interface HomeBlock {
  id: string;
  label: string;
  /** Marks the block as following the day swipe (the home screen animates these). */
  daily?: boolean;
  /**
   * The block is always as tall as its content: no inner scroll, and only its width
   * resizes. Principles reads as a page, not a scrolling box (Berto, 2026-10-26).
   * Vision, Training, Meals and Calendar too (2026-10-29): a fixed height left a gap
   * under short content, and the blocks below now close up under them.
   */
  autoHeight?: boolean;
  node: ReactNode;
}

const COLS = 12;
const ROW_HEIGHT = 20;
const MARGIN: [number, number] = [32, 16];
/** Below this container width the blocks stack instead of sitting on the grid. */
const GRID_MIN_WIDTH = 900;

/**
 * Sleep, training and meals sit across the top at full width (Berto, 2026-10-29:
 * "has to be the top thing ... nice and big"); they replaced the separate Training
 * and Meals blocks, which a saved layout simply drops.
 */
export const DEFAULT_HOME_LAYOUT: HomeBlockPosition[] = [
  { i: "today", x: 0, y: 0, w: 12, h: 12 },
  { i: "vision", x: 0, y: 12, w: 6, h: 10 },
  { i: "calendar", x: 6, y: 12, w: 6, h: 20 },
  { i: "tasks", x: 6, y: 32, w: 6, h: 28 },
  { i: "principles", x: 0, y: 22, w: 6, h: 10 },
];

/**
 * Narrowest a block may be. Tasks takes half the page so titles don't wrap past its
 * Status, Due and Priority columns (Berto, 2026-10-25); Calendar sits above it at the same width.
 */
const MIN_W: Record<string, number> = { calendar: 6, tasks: 6 };

/**
 * Widens any block narrower than its minimum, leftwards, and trims the blocks
 * beside it so nothing overlaps — otherwise the grid would push the widened
 * block down below its neighbours instead.
 */
function withMinWidths(layout: HomeBlockPosition[]): HomeBlockPosition[] {
  let out = layout;
  for (const [id, min] of Object.entries(MIN_W)) {
    const b = out.find((p) => p.i === id);
    if (!b || b.w >= min) continue;
    const x = Math.min(b.x, COLS - min);
    const grown = { ...b, x, w: Math.max(min, b.x + b.w - x) };
    out = out.map((p) => {
      if (p.i === id) return grown;
      const sameRows = p.y < grown.y + grown.h && grown.y < p.y + p.h;
      const overlaps = p.x < grown.x + grown.w && grown.x < p.x + p.w;
      return sameRows && overlaps && p.x < grown.x ? { ...p, w: grown.x - p.x } : p;
    });
  }
  return out;
}

/** The saved layout, with any block it doesn't know about yet put back where the default has it. */
function withAllBlocks(saved: HomeBlockPosition[] | null, ids: string[]): HomeBlockPosition[] {
  let base = (saved ?? []).filter((p) => ids.includes(p.i));
  const missing = DEFAULT_HOME_LAYOUT.filter((d) => ids.includes(d.i) && !base.some((p) => p.i === d.i));
  // A new block takes its default spot, rather than the grid dropping it below
  // the saved blocks: a block reaching into its column from the left is trimmed
  // to fit beside it (as withMinWidths does), anything else there is pushed down.
  for (const d of missing) {
    base = base.map((p) => {
      if (p.x >= d.x + d.w || d.x >= p.x + p.w) return p;
      if (p.x < d.x && p.y + p.h > d.y) return { ...p, w: d.x - p.x };
      return p.y >= d.y ? { ...p, y: p.y + d.h } : p;
    });
  }
  const unknown = ids
    .filter((id) => !base.some((p) => p.i === id) && !missing.some((p) => p.i === id))
    .map((i) => ({ i, x: 0, y: Infinity, w: 8, h: 8 }));
  return withMinWidths([...base, ...missing, ...unknown]);
}

/** Grid rows needed to show `px` of content: h rows span h * ROW_HEIGHT plus the h - 1 gaps between them. */
function rowsFor(px: number): number {
  return Math.max(1, Math.ceil((px + MARGIN[1]) / (ROW_HEIGHT + MARGIN[1])));
}

/** Reports its content's height whenever it changes (an editor loading, a toggle opening). */
function Measured({ onHeight, children }: { onHeight: (px: number) => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const report = useRef(onHeight);
  report.current = onHeight;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(() => report.current(el.offsetHeight));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  // flow-root keeps the content's bottom margin inside the measurement; pr-1 matches
  // the scrolling blocks' gutter so the edges of stacked blocks line up.
  return (
    <div ref={ref} className="flow-root pr-1">
      {children}
    </div>
  );
}

function readingOrder(layout: readonly HomeBlockPosition[]): string[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x).map((p) => p.i);
}

export function HomeGrid({ blocks }: { blocks: HomeBlock[] }) {
  const ids = useMemo(() => blocks.map((b) => b.id), [blocks]);
  const [layout, setLayout] = useState<HomeBlockPosition[]>(() => withAllBlocks(null, ids));
  const [customised, setCustomised] = useState(false);
  /** Rows each autoHeight block needs right now; overrides whatever height the layout has saved. */
  const [fitRows, setFitRows] = useState<Record<string, number>>({});
  const { width, containerRef, mounted } = useContainerWidth();

  useEffect(() => {
    fetch("/api/settings/home-layout")
      .then((r) => r.json())
      .then(({ layout: saved }) => {
        if (!saved) return;
        setLayout(withAllBlocks(saved, ids));
        setCustomised(true);
      })
      .catch(() => {});
    // ids is fixed for the page's lifetime; load once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function save(next: HomeBlockPosition[] | null) {
    const res = await fetch("/api/settings/home-layout", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ layout: next }),
    }).catch(() => null);
    if (!res?.ok) toast.error("Couldn't save the layout");
  }

  function commit(next: Layout) {
    const positions = next.map(({ i, x, y, w, h }) => ({ i, x, y, w, h }));
    setLayout(positions);
    setCustomised(true);
    void save(positions);
  }

  function reset() {
    setLayout(withAllBlocks(null, ids));
    setCustomised(false);
    void save(null);
  }

  const byId = new Map(blocks.map((b) => [b.id, b]));
  const asGrid = mounted && width >= GRID_MIN_WIDTH;

  return (
    <div ref={containerRef} id="home-blocks" className="-mx-6">
      {asGrid ? (
        <ReactGridLayout
          width={width}
          layout={layout.map((p) => ({
            ...p,
            ...(MIN_W[p.i] && { minW: MIN_W[p.i] }),
            ...(byId.get(p.i)?.autoHeight && { h: fitRows[p.i] ?? p.h, resizeHandles: ["e"] as const }),
          }))}
          gridConfig={{ cols: COLS, rowHeight: ROW_HEIGHT, margin: MARGIN, containerPadding: [24, 0] }}
          dragConfig={{ enabled: true, handle: ".home-block-grip" }}
          resizeConfig={{ enabled: true, handles: ["se"] }}
          onDragStop={commit}
          onResizeStop={commit}
        >
          {layout.map((p) => {
            const block = byId.get(p.i);
            if (!block) return <div key={p.i} />;
            return (
              <div key={block.id} id={`home-block-${block.id}`} data-day-block={block.daily || undefined} className="group/block relative">
                <button
                  type="button"
                  className="home-block-grip absolute -left-6 top-0 z-10 flex h-6 w-5 cursor-grab items-center justify-center rounded text-muted-foreground opacity-0 transition-opacity hover:bg-muted active:cursor-grabbing group-hover/block:opacity-100 focus-visible:opacity-100"
                  aria-label={`Move ${block.label}`}
                  title={`Drag to move ${block.label}`}
                >
                  <GripVerticalIcon className="size-4" />
                </button>
                {block.autoHeight ? (
                  <Measured onHeight={(px) => setFitRows((prev) => (prev[block.id] === rowsFor(px) ? prev : { ...prev, [block.id]: rowsFor(px) }))}>
                    {block.node}
                  </Measured>
                ) : (
                  <div className="h-full overflow-y-auto overflow-x-hidden pr-1">{block.node}</div>
                )}
              </div>
            );
          })}
        </ReactGridLayout>
      ) : (
        <div className="flex flex-col gap-8 px-6">
          {readingOrder(layout).map((id) => {
            const block = byId.get(id);
            return block ? (
              <div key={id} id={`home-block-${id}`} data-day-block={block.daily || undefined}>
                {block.node}
              </div>
            ) : null;
          })}
        </div>
      )}
      {asGrid && customised && (
        <div className="flex justify-end px-8 pt-2">
          <button
            type="button"
            onClick={reset}
            className={cn("inline-flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground")}
          >
            <RotateCcwIcon className="size-3" />
            Reset layout
          </button>
        </div>
      )}
    </div>
  );
}

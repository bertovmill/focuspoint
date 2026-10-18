"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import { ChevronDownIcon } from "lucide-react";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { DotPattern } from "@/components/ui/dot-pattern";
import { Skeleton } from "@/components/ui/skeleton";
import { STRATEGY_SEED } from "@/lib/strategy-seed";
import { cn } from "@/lib/utils";

import "@excalidraw/excalidraw/index.css";

// Excalidraw touches window/document at module scope, so it can't be server-rendered.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

interface Scene {
  elements: readonly ExcalidrawElement[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null };
  files: BinaryFiles;
}

const AUTOSAVE_MS = 1500;

/**
 * Resolve once Excalidraw's hand-drawn font is actually usable.
 *
 * Two traps here. Excalidraw registers Excalifont with the FontFace API when the
 * component *mounts*, not when the module loads — so nothing to wait on exists
 * until then. And `document.fonts.check()` answers "are all matching faces
 * loaded?", which is vacuously **true** while no face matches at all; using it as
 * a readiness test silently passes before the font is anywhere near ready.
 * So: poll the registry for the face itself, then load it.
 */
async function waitForHandDrawnFont(deadlineMs = 5000) {
  const registered = () => [...document.fonts].some((f) => f.family.replace(/"/g, "") === "Excalifont");
  const started = performance.now();
  while (!registered() && performance.now() - started < deadlineMs) {
    await new Promise((r) => setTimeout(r, 100));
  }
  // Worst case (font never registers) we fall through and measure in the fallback,
  // which is what the seed used to do anyway — degraded, not broken.
  await document.fonts.load("16px Excalifont").catch(() => {});
  await document.fonts.load("20px Excalifont").catch(() => {});
}

// Remembered across sessions so the board stays however it was last left.
const HEIGHT_KEY = "focuspoint:strategy-board-height";
const DEFAULT_HEIGHT = 400;
// Excalidraw floats its toolbar over the top of the canvas, so a centred fit puts
// the flywheel behind it. The fitted view is pushed down by this much — more than
// the toolbar's own height, since it also has to give back the fit's top margin.
const TOOLBAR_CLEARANCE = 80;
const MIN_HEIGHT = 160;
const MAX_HEIGHT = 900;
// Below this a drag snaps the board shut rather than leaving a useless sliver.
const SNAP_SHUT = 80;
// A pointer that barely moved counts as a click on the handle, not a drag.
const CLICK_SLOP = 4;

/**
 * The strategy board: an Excalidraw scene of its own, sitting above the task
 * notebook on the Tasks tab. Same idea as <TaskCanvas>, but a completely separate
 * scene (`task_canvas` row 2, via /api/strategy-canvas) with no task cards on it —
 * this is where the flywheel lives, and it's meant to be redrawn as the strategy
 * changes rather than being hardcoded.
 *
 * The first time it's opened it stamps itself with STRATEGY_SEED, the flywheel as
 * it was when this was a React component. After that it's whatever's been drawn.
 *
 * The canvas background is transparent so the amber → violet → emerald wash behind
 * it shows through; see `.strategy-board .excalidraw` in globals.css.
 */
export function StrategyBoard() {
  const { resolvedTheme } = useTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialScene, setInitialScene] = useState<Scene | null>(null);
  const [loading, setLoading] = useState(true);
  // Set when the board has never been saved: it mounts empty, then gets stamped with
  // the flywheel once Excalidraw is up (see the seeding effect for why it has to be
  // in that order).
  const [pendingSeed, setPendingSeed] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ---------------------------------------------------------------- scene load/save

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/strategy-canvas");
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        const scene = data?.scene ?? {};
        const elements: ExcalidrawElement[] = scene.elements ?? [];
        setInitialScene({
          elements,
          appState: scene.appState ?? {},
          files: scene.files ?? {},
        });
        // A row that has never been written (updated_at null) gets the starting
        // flywheel. An existing row that's empty stays empty — clearing the board is
        // a deliberate act and shouldn't undo itself on the next visit.
        if (data?.updated_at == null && elements.length === 0) setPendingSeed(true);
      } catch {
        if (!cancelled) setInitialScene({ elements: [], appState: {}, files: {} });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const saveScene = useCallback(async () => {
    if (!api) return;
    const appState = api.getAppState();
    const scene: Scene = {
      elements: api.getSceneElements(),
      appState: {
        viewBackgroundColor: appState.viewBackgroundColor,
        gridSize: appState.gridSize,
      },
      files: api.getFiles(),
    };
    try {
      await fetch("/api/strategy-canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
    } catch {
      // Autosave is best-effort — the next edit re-arms it rather than nagging.
    }
  }, [api]);

  const saveSceneRef = useRef(saveScene);
  saveSceneRef.current = saveScene;

  // Flush a pending save on unmount, so switching tabs mid-debounce doesn't drop it.
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        saveSceneRef.current();
      }
    },
    [],
  );

  // Excalidraw fires onChange for pure viewport moves too. Debouncing on every one of
  // them is fine here (there are no cards to keep in sync), and it means a pan that
  // never touches an element just re-saves the same scene.
  const handleChange = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      saveSceneRef.current();
    }, AUTOSAVE_MS);
  }, []);

  // Stamp the starting flywheel onto a board that has never been saved.
  //
  // This deliberately runs *after* Excalidraw has mounted rather than feeding the
  // seed in through initialData. convertToExcalidrawElements measures every bound
  // label once, at conversion time, and bakes the result into the element — so
  // converting before Excalifont exists measures in a fallback font and every label
  // renders clipped mid-word, permanently, because that's what gets saved.
  useEffect(() => {
    if (!api || !pendingSeed) return;
    let cancelled = false;
    (async () => {
      await waitForHandDrawnFont();
      const { convertToExcalidrawElements } = await import("@excalidraw/excalidraw");
      if (cancelled) return;
      api.updateScene({ elements: convertToExcalidrawElements(STRATEGY_SEED, { regenerateIds: false }) });
      setPendingSeed(false);
      // Save straight away, so the seed survives a reload even if nothing is drawn.
      saveSceneRef.current();
    })();
    return () => {
      cancelled = true;
    };
  }, [api, pendingSeed]);

  // Fit the board's contents into whatever height it's at. Without this the
  // flywheel — around 1200 scene units wide — opens cropped at 100% zoom.
  const fittedRef = useRef(false);
  useEffect(() => {
    if (!api || loading || pendingSeed || fittedRef.current) return;
    let timer: ReturnType<typeof setTimeout>;
    let tries = 0;
    const tick = () => {
      const elements = api.getSceneElements();
      // Excalidraw reports width/height 0 until it has measured its container, and
      // fitting against a zero-size viewport silently does nothing — hence the poll
      // rather than a fixed delay.
      const { width, height } = api.getAppState();
      if (elements.length > 0 && width > 0 && height > 0) {
        fittedRef.current = true;
        // viewportZoomFactor leaves a margin so the board doesn't open wall-to-wall…
        api.scrollToContent(elements, { fitToContent: true, viewportZoomFactor: 0.8, animate: false });
        // …and the fitted view is then nudged down, because a centred fit parks the
        // top of the flywheel underneath Excalidraw's floating toolbar. Scene maps to
        // viewport as (sceneY + scrollY) * zoom, so a bigger scrollY moves ink down.
        const { scrollY, zoom } = api.getAppState();
        api.updateScene({ appState: { scrollY: scrollY + TOOLBAR_CLEARANCE / zoom.value } });
        return;
      }
      if (++tries < 25) timer = setTimeout(tick, 100);
    };
    timer = setTimeout(tick, 50);
    return () => clearTimeout(timer);
  }, [api, loading, pendingSeed]);

  // --------------------------------------------------------------------- resizing

  const [height, setHeight] = useState(DEFAULT_HEIGHT);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);

  // Restore after mount so the server render stays deterministic.
  useEffect(() => {
    const saved = window.localStorage.getItem(HEIGHT_KEY);
    if (saved !== null && Number.isFinite(Number(saved))) {
      setHeight(Math.max(0, Math.min(MAX_HEIGHT, Number(saved))));
    }
  }, []);

  const apply = useCallback((next: number) => {
    setHeight(next);
    window.localStorage.setItem(HEIGHT_KEY, String(Math.round(next)));
  }, []);

  const collapsed = height < MIN_HEIGHT;

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    drag.current = { startY: e.clientY, startHeight: height, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    if (!d) return;
    const delta = e.clientY - d.startY;
    if (Math.abs(delta) > CLICK_SLOP) d.moved = true;
    setHeight(Math.min(MAX_HEIGHT, Math.max(0, d.startHeight + delta)));
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const d = drag.current;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    if (!d) return;
    if (!d.moved) {
      // A tap on the handle is the shortcut: open to the last usable size, or shut.
      apply(collapsed ? DEFAULT_HEIGHT : 0);
      return;
    }
    // Anything under the minimum usable canvas height snaps all the way shut —
    // a 40px-tall Excalidraw is just a cropped toolbar.
    setHeight((h) => {
      const next = h < SNAP_SHUT ? 0 : Math.max(MIN_HEIGHT, h);
      window.localStorage.setItem(HEIGHT_KEY, String(Math.round(next)));
      return next;
    });
  }

  return (
    <div className="shrink-0">
      <div
        className={cn(
          "strategy-board relative overflow-hidden",
          "bg-gradient-to-br from-amber-500/10 via-violet-500/10 to-emerald-500/10",
          !dragging && "transition-[height] duration-200 ease-out",
        )}
        style={{ height }}
      >
        {/* Ambient layers, back to front: dot grid, then the two colour blooms.
            All behind the canvas, which is transparent so they read through it. */}
        <DotPattern
          cr={0.7}
          className={cn(
            "pointer-events-none absolute inset-0 h-full w-full fill-foreground/25",
            "[mask-image:radial-gradient(420px_circle_at_center,white,transparent)]",
          )}
        />
        <div className="pointer-events-none absolute -right-16 -top-16 size-44 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 size-44 rounded-full bg-emerald-500/20 blur-3xl" />

        <div className="relative z-10 h-full w-full">
          {loading || !initialScene ? (
            <Skeleton className="h-full w-full bg-transparent" />
          ) : (
            <Excalidraw
              excalidrawAPI={setApi}
              onChange={handleChange}
              theme={resolvedTheme === "dark" ? "dark" : "light"}
              initialData={{
                elements: initialScene.elements,
                appState: {
                  // Transparent, so the gradient wash behind the board shows through.
                  viewBackgroundColor: "transparent",
                  // Nullable in the stored scene but only optional in AppState, so a
                  // persisted `null` (grid off) has to become `undefined`.
                  gridSize: initialScene.appState.gridSize ?? undefined,
                  viewModeEnabled: false,
                },
                files: initialScene.files,
                scrollToContent: false,
              }}
              UIOptions={{ canvasActions: { loadScene: false, toggleTheme: false } }}
            />
          )}
        </div>
      </div>

      {/* The handle stays outside the board so it survives a full collapse.
          Drag to resize, click to toggle. */}
      <div
        role="button"
        tabIndex={0}
        aria-label={collapsed ? "Expand the strategy board" : "Collapse the strategy board"}
        aria-expanded={!collapsed}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            apply(collapsed ? DEFAULT_HEIGHT : 0);
          }
        }}
        className={cn(
          "group flex h-4 cursor-ns-resize touch-none select-none items-center justify-center border-b",
          "bg-gradient-to-b from-background/0 to-muted/40 hover:to-muted/70",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        )}
      >
        <span className="flex items-center gap-1.5">
          <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
          <ChevronDownIcon
            className={cn(
              "size-3 text-muted-foreground/60 transition-transform",
              collapsed ? "rotate-0" : "rotate-180",
            )}
          />
          <span className="h-1 w-10 rounded-full bg-border transition-colors group-hover:bg-muted-foreground/50" />
        </span>
      </div>
    </div>
  );
}

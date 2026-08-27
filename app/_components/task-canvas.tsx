"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import dynamic from "next/dynamic";
import { useTheme } from "next-themes";
import {
  CalendarClockIcon,
  CheckIcon,
  ClockIcon,
  CopyIcon,
  CrosshairIcon,
  HourglassIcon,
  MessageSquarePlusIcon,
  PauseIcon,
  PinIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  TargetIcon,
  TrashIcon,
  XIcon,
} from "lucide-react";
import { toast } from "sonner";
import type { ExcalidrawImperativeAPI, BinaryFiles } from "@excalidraw/excalidraw/types";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { CATEGORY_BADGE_CLASS, TASK_CATEGORIES, TASK_CATEGORY_LABELS, type TaskCategory } from "@/lib/task-categories";
import {
  CARD_COLORS,
  CARD_COLOR_CLASSES,
  CARD_COLOR_LABELS,
  CARD_COLOR_SWATCH_CLASSES,
  type CardColor,
} from "@/lib/task-colors";
import { PipelineLanes } from "@/app/_components/pipeline-lanes";
import {
  ESTIMATE_OPTIONS,
  FOLLOW_UP_OPTIONS,
  formatCountdown,
  formatEstimateLabel,
  isDoneToday,
  isInLane,
  PRIORITIES,
  remainingSeconds,
  type Todo,
} from "@/lib/todo";
import { TaskLatestUpdate, TaskUpdateComposer } from "@/app/_components/task-update-line";
import { StreakChip } from "@/app/_components/streak-chip";
import { cn } from "@/lib/utils";

import "@excalidraw/excalidraw/index.css";

// Excalidraw touches window/document at module scope, so it can't be server-rendered.
const Excalidraw = dynamic(async () => (await import("@excalidraw/excalidraw")).Excalidraw, {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

// The persisted document. appState is deliberately a small whitelist — the full appState
// carries transient junk (and a `collaborators` Map that doesn't survive JSON).
interface Scene {
  elements: readonly ExcalidrawElement[];
  appState: { viewBackgroundColor?: string; gridSize?: number | null };
  files: BinaryFiles;
}

const AUTOSAVE_MS = 1500;

// Card geometry, in Excalidraw *scene* units (1 unit = 1px at 100% zoom).
const CARD_W = 236;
const CARD_GAP = 12;
// Where never-placed tasks land: tidy columns near the scene origin, so there's always
// one predictable place to look when something new shows up. Offset rather than sitting
// exactly on the origin — a fresh canvas opens at scene (0,0),
// and both our toolbar (top left) and Excalidraw's (top centre) live up there, so the
// first row of cards would open underneath them.
const INBOX_X = 24;
const INBOX_Y = 120;
const INBOX_COL_W = CARD_W + 32;
// A column any longer than this is a wall, which is exactly what the canvas is meant
// to replace — wrap into a new column instead.
const INBOX_COL_MAX = 8;

// Cards are auto-height (the title wraps), and auto-placement runs before they've
// rendered, so estimate: a one-line card is ~62px and each extra wrapped line adds
// ~17px. Roughly 27 characters fit on a line at CARD_W. A latest-update line adds a
// clamped two-line block underneath.
function estimateCardHeight(t: Pick<Todo, "title" | "last_update">) {
  const lines = Math.max(1, Math.ceil(t.title.length / 27));
  return 62 + (lines - 1) * 17 + (t.last_update ? 40 : 0);
}

// Excalidraw layers its own canvases at z-index 1–2 and its toolbar UI at 4. Slotting
// the card layer at 3 puts cards above the drawing but under Excalidraw's controls —
// and because the layer is portaled *inside* the Excalidraw container, wheel events
// over a card still bubble to Excalidraw, so pan/zoom keeps working over the cards.
const CARD_LAYER_Z = 3;

// The pinned pipeline panel, and how far the canvas toolbar slides right to clear it.
const LANE_COLLAPSED_KEY = "focuspoint.content-lane.collapsed";
const LANE_OPEN_OFFSET = "16.5rem";
const LANE_CLOSED_OFFSET = "2.75rem";

const PRIORITY_DOT: Record<Todo["priority"], string> = {
  urgent: "bg-priority-urgent",
  high: "bg-priority-high",
  normal: "bg-muted-foreground/40",
  low: "bg-muted-foreground/20",
};

interface View {
  scrollX: number;
  scrollY: number;
  zoom: number;
}

// A point on the board, in both frames: where to draw the popover (container-relative
// pixels) and where the card it creates should live (scene units).
interface Spawn {
  left: number;
  top: number;
  sceneX: number;
  sceneY: number;
}

type Composer = { at: "toolbar" } | ({ at: "board" } & Spawn);

export interface TaskCanvasProps {
  todos: Todo[];
  loading: boolean;
  /** Ticks once a second in the parent so every countdown runs off one clock. */
  nowTick: number;
  completingIds: Set<number>;
  onComplete: (id: number, opts?: { repeat?: boolean; followUpDays?: number }) => void;
  onUncomplete: (id: number) => void;
  onToggleTimer: (todo: Todo) => void;
  /** "Working on now" — capped at WORKING_LIMIT by the parent. */
  onToggleInProgress: (id: number, in_progress: boolean) => void;
  onToggleWaiting: (id: number, waiting: boolean) => void;
  onDelete: (id: number) => void;
  /** PATCHes the task and syncs parent state. */
  onUpdate: (id: number, patch: Partial<Todo>) => void;
  /** Parent pushes the new row into its own list. */
  onCreated: (todo: Todo) => void;
  /** State-only patch — the canvas has already persisted it (or is mid-drag). */
  onLocalPatch: (id: number, patch: Partial<Todo>) => void;
  /** Put a task back in the pinned window after it was removed from there. */
  onSetPinned: (id: number, pinned: boolean) => void;
}

export function TaskCanvas({
  todos,
  loading,
  nowTick,
  completingIds,
  onComplete,
  onUncomplete,
  onToggleTimer,
  onToggleInProgress,
  onToggleWaiting,
  onDelete,
  onUpdate,
  onCreated,
  onLocalPatch,
  onSetPinned,
}: TaskCanvasProps) {
  const { resolvedTheme } = useTheme();
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [initialScene, setInitialScene] = useState<Scene | null>(null);
  const [sceneLoading, setSceneLoading] = useState(true);
  // Where to portal the card layer, and whether the drawing tool currently wants the
  // pointer (so you can scribble straight over a card).
  const [cardHost, setCardHost] = useState<HTMLElement | null>(null);
  const [drawing, setDrawing] = useState(false);

  // The composer is either docked under the toolbar ("toolbar") or floating at a point
  // on the board — right-click / "N" — in which case the new card lands exactly there.
  const [composer, setComposer] = useState<Composer | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newEstimate, setNewEstimate] = useState<number>(30);
  const [creating, setCreating] = useState(false);
  const composerRef = useRef<HTMLInputElement>(null);
  // Right-click on empty canvas puts this one-item menu under the cursor.
  const [boardMenu, setBoardMenu] = useState<Spawn | null>(null);

  const [editingId, setEditingId] = useState<number | null>(null);

  // The card whose "post update" box is open, if any. Only one at a time.

  const [composingId, setComposingId] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState("");

  // Marquee selection. Dragging a box across empty canvas selects every card it touches,
  // and the selection is then something you act on as one thing: drag it, colour it,
  // finish it, bin it. Mirrored into a ref so the pointer handlers (bound once) can read
  // it without being rebuilt on every selection change.
  const [selectedIds, setSelectedIds] = useState<ReadonlySet<number>>(() => new Set());
  const selectedRef = useRef<ReadonlySet<number>>(selectedIds);
  const setSelection = useCallback((next: ReadonlySet<number>) => {
    selectedRef.current = next;
    setSelectedIds(next);
  }, []);

  // Lane open/closed lives here, not in the lane, because the canvas toolbar has to
  // shift out of its way. Starts closed and is corrected from localStorage on mount,
  // so the server render and the first client render agree.
  const [laneCollapsed, setLaneCollapsed] = useState(false);
  useEffect(() => {
    setLaneCollapsed(window.localStorage.getItem(LANE_COLLAPSED_KEY) === "1");
  }, []);
  const toggleLane = useCallback(() => {
    setLaneCollapsed((c) => {
      window.localStorage.setItem(LANE_COLLAPSED_KEY, c ? "0" : "1");
      return !c;
    });
  }, []);

  // Pipeline pieces and the tasks hanging off them live in the pinned panel, never
  // as free-floating cards — otherwise the same task would sit in two places.
  //
  // A checked-off card leaves the board: the canvas is the *open* work, and finished
  // cards would otherwise silt it up. It sticks around for the ~600ms the parent keeps
  // it in `completingIds`, so you still see it tick and fade before it goes. (The done
  // count in the toolbar, and the list view, both still know about it.)
  //
  // `completed` alone isn't enough: a recurring task never flips it — it just gets a new
  // due date — so `isDoneToday` is what makes a daily card leave today and come back
  // tomorrow.
  const canvasTodos = useMemo(
    () =>
      todos.filter(
        (t) => !isInLane(t) && (!(t.completed || isDoneToday(t)) || completingIds.has(t.id)),
      ),
    [todos, completingIds],
  );

  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  // The live view transform. Kept in a ref (not state) and written straight to the
  // layer's style so panning doesn't re-render every card, and so drag maths always
  // reads the current zoom.
  const viewRef = useRef<View>({ scrollX: 0, scrollY: 0, zoom: 1 });
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Mirror, so the pointer handlers can read the current tasks without being rebuilt
  // (and re-bound) on every todos change.
  const todosRef = useRef(todos);
  todosRef.current = todos;

  // ---------------------------------------------------------------- scene load/save

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/task-canvas");
        const data = res.ok ? await res.json() : null;
        if (cancelled) return;
        const scene = data?.scene ?? {};
        setInitialScene({
          elements: scene.elements ?? [],
          appState: scene.appState ?? {},
          files: scene.files ?? {},
        });
      } catch {
        if (!cancelled) setInitialScene({ elements: [], appState: {}, files: {} });
      } finally {
        if (!cancelled) setSceneLoading(false);
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
      await fetch("/api/task-canvas", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scene }),
      });
    } catch {
      // Autosave is best-effort — the next edit re-arms it rather than nagging.
    }
  }, [api]);

  // Flush a pending save on unmount so leaving the tab mid-debounce doesn't drop it.
  const saveSceneRef = useRef(saveScene);
  saveSceneRef.current = saveScene;
  useEffect(
    () => () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        saveSceneRef.current();
      }
    },
    [],
  );

  // ------------------------------------------------------------------- view + host

  const applyTransform = useCallback((v: View) => {
    const el = layerRef.current;
    if (!el) return;
    // Excalidraw maps scene → viewport as (sceneX + scrollX) * zoom, so the layer
    // translates by scrollX*zoom and scales by zoom, with cards laid out at raw
    // scene coordinates inside it.
    el.style.transform = `translate(${v.scrollX * v.zoom}px, ${v.scrollY * v.zoom}px) scale(${v.zoom})`;
  }, []);

  const handleChange = useCallback(
    (_elements: readonly ExcalidrawElement[], appState: { scrollX: number; scrollY: number; zoom: { value: number }; activeTool: { type: string } }) => {
      const next: View = { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value };
      const prev = viewRef.current;
      if (next.scrollX !== prev.scrollX || next.scrollY !== prev.scrollY || next.zoom !== prev.zoom) {
        viewRef.current = next;
        applyTransform(next);
      }
      // Anything other than selection is a drawing tool — let the pointer through to
      // the canvas so you can draw an arrow that starts on top of a card.
      const isDrawing = appState.activeTool.type !== "selection";
      setDrawing((d) => (d === isDrawing ? d : isDrawing));

      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = setTimeout(() => {
        autoSaveTimerRef.current = null;
        saveSceneRef.current();
      }, AUTOSAVE_MS);
    },
    [applyTransform],
  );

  // Find the Excalidraw container to portal the card layer into, once it has mounted.
  useEffect(() => {
    if (!api) return;
    const host = wrapRef.current?.querySelector<HTMLElement>(".excalidraw") ?? null;
    setCardHost(host);
    // The initial view isn't reported until the first change, so seed it here.
    const appState = api.getAppState();
    viewRef.current = { scrollX: appState.scrollX, scrollY: appState.scrollY, zoom: appState.zoom.value };
  }, [api]);

  // The transform lives on a ref-managed style, so re-apply it whenever the layer
  // remounts (portal host arriving, theme swap) or React would blow it away.
  useEffect(() => {
    applyTransform(viewRef.current);
  }, [applyTransform, cardHost]);

  // Excalidraw listens for wheel on its interactive <canvas>, which is a *sibling* of
  // the card layer, not an ancestor — so a wheel event over a card bubbles up to the
  // shared container and dies there, and the notebook won't scroll or zoom under your
  // cursor. Re-dispatch an equivalent event on the canvas so cards are transparent to
  // scrolling. (Empty canvas needs none of this: those events hit the canvas directly.)
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !cardHost) return;
    const canvas = cardHost.querySelector<HTMLCanvasElement>("canvas.interactive");
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      // Guard against re-entering on the event we just synthesised.
      if (!e.isTrusted) return;
      e.preventDefault();
      canvas.dispatchEvent(
        new WheelEvent("wheel", {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaZ: e.deltaZ,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          // ctrl/meta + wheel is pinch-zoom — forwarding the modifiers keeps that working.
          ctrlKey: e.ctrlKey,
          shiftKey: e.shiftKey,
          altKey: e.altKey,
          metaKey: e.metaKey,
          bubbles: true,
          cancelable: true,
        }),
      );
    };
    // Non-passive, otherwise preventDefault is a no-op and the page fights the canvas.
    layer.addEventListener("wheel", onWheel, { passive: false });
    return () => layer.removeEventListener("wheel", onWheel);
  }, [cardHost]);

  // ------------------------------------------------------------------ selection

  // Every card's rectangle in scene units. The layer lays cards out at raw scene
  // coordinates and only the *layer* is scaled, so offsetLeft/Top/Height are already in
  // the same frame as Excalidraw's selection box — no conversion needed, and the height
  // is the real wrapped height rather than an estimate.
  const cardSceneRects = useCallback(() => {
    const layer = layerRef.current;
    if (!layer) return [];
    return Array.from(layer.querySelectorAll<HTMLElement>("[data-task-card]")).map((el) => ({
      id: Number(el.dataset.taskCard),
      x: el.offsetLeft,
      y: el.offsetTop,
      w: el.offsetWidth,
      h: el.offsetHeight,
    }));
  }, []);

  // We don't draw our own rubber band: Excalidraw is already drawing one for its own
  // shapes, and it publishes the in-progress box as appState.selectionElement. Reading
  // that means one drag selects drawings and cards together, and it also tells us when a
  // drag *isn't* a box-select (dragging a shape, panning) — selectionElement is null.
  useEffect(() => {
    const host = cardHost;
    if (!host || !api) return;
    let base: ReadonlySet<number> | null = null;
    let frame: number | null = null;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      // Only presses that land on the bare canvas start a marquee — cards, the toolbar
      // and our own popovers keep their clicks.
      if ((e.target as HTMLElement).tagName !== "CANVAS") return;
      base = e.shiftKey ? selectedRef.current : new Set<number>();
      // A plain click on empty canvas is also how you let go of a selection.
      if (!e.shiftKey && selectedRef.current.size > 0) setSelection(new Set());
    };

    const onPointerMove = () => {
      if (base === null || frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        if (base === null) return;
        const box = api.getAppState().selectionElement;
        if (!box) return;
        const x1 = Math.min(box.x, box.x + box.width);
        const x2 = Math.max(box.x, box.x + box.width);
        const y1 = Math.min(box.y, box.y + box.height);
        const y2 = Math.max(box.y, box.y + box.height);
        // Touched, not enclosed — same rule Excalidraw uses for its own shapes.
        const next = new Set(base);
        for (const r of cardSceneRects()) {
          if (r.x < x2 && r.x + r.w > x1 && r.y < y2 && r.y + r.h > y1) next.add(r.id);
        }
        if (next.size !== selectedRef.current.size || [...next].some((id) => !selectedRef.current.has(id))) {
          setSelection(next);
        }
      });
    };

    const onPointerUp = () => {
      base = null;
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
    };

    host.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    return () => {
      host.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      if (frame !== null) cancelAnimationFrame(frame);
    };
  }, [api, cardHost, cardSceneRects, setSelection]);

  // Escape drops the selection, the same key that closes everything else on the board.
  useEffect(() => {
    if (selectedIds.size === 0) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelection(new Set());
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedIds, setSelection]);

  // Cards that have left the board (checked off, deleted, dragged into a lane) shouldn't
  // linger in the selection and keep the action bar claiming a bigger count than you see.
  useEffect(() => {
    const live = new Set(canvasTodos.map((t) => t.id));
    const stale = [...selectedRef.current].some((id) => !live.has(id));
    if (stale) setSelection(new Set([...selectedRef.current].filter((id) => live.has(id))));
  }, [canvasTodos, setSelection]);

  // Everything the action bar does, it does to the whole selection and then lets go of
  // it — the selection has served its purpose once you've acted on it.
  const bulkUpdate = useCallback(
    (patch: Partial<Todo>) => {
      for (const id of selectedRef.current) onUpdate(id, patch);
    },
    [onUpdate],
  );

  const bulkComplete = useCallback(() => {
    for (const id of selectedRef.current) onComplete(id);
    setSelection(new Set());
  }, [onComplete, setSelection]);

  const bulkDelete = useCallback(() => {
    const ids = [...selectedRef.current];
    // Deleting a boardful of cards in one click is the one thing here that can't be
    // undone, so it asks first.
    if (!window.confirm(`Delete ${ids.length} tasks?`)) return;
    for (const id of ids) onDelete(id);
    setSelection(new Set());
  }, [onDelete, setSelection]);

  // --------------------------------------------------------------- card placement

  // Tasks that have never been placed get dropped down the inbox column, below
  // whatever is already parked there, and the position is persisted so they stop
  // moving. Guarded by a ref so a re-render mid-request doesn't double-post.
  const placingRef = useRef(new Set<number>());
  useEffect(() => {
    const unplaced = canvasTodos.filter((t) => t.canvas_x == null || t.canvas_y == null);
    if (unplaced.length === 0) return;
    const placed = canvasTodos.filter((t) => t.canvas_x != null && t.canvas_y != null);
    // Only cards still parked in an inbox column push new arrivals down; anything
    // dragged out into the notebook is left alone.
    const colBottom = new Map<number, number>();
    const colCount = new Map<number, number>();
    for (const t of placed) {
      const offset = (t.canvas_x ?? 0) - INBOX_X;
      if (offset < 0 || offset % INBOX_COL_W !== 0) continue;
      const col = offset / INBOX_COL_W;
      colBottom.set(col, Math.max(colBottom.get(col) ?? INBOX_Y, (t.canvas_y ?? 0) + estimateCardHeight(t) + CARD_GAP));
      colCount.set(col, (colCount.get(col) ?? 0) + 1);
    }
    // Start filling at the first column with room left.
    let col = 0;
    while ((colCount.get(col) ?? 0) >= INBOX_COL_MAX) col += 1;
    for (const t of unplaced) {
      if (placingRef.current.has(t.id)) continue;
      placingRef.current.add(t.id);
      if ((colCount.get(col) ?? 0) >= INBOX_COL_MAX) col += 1;
      const x = INBOX_X + col * INBOX_COL_W;
      const y = colBottom.get(col) ?? INBOX_Y;
      colBottom.set(col, y + estimateCardHeight(t) + CARD_GAP);
      colCount.set(col, (colCount.get(col) ?? 0) + 1);
      onLocalPatch(t.id, { canvas_x: x, canvas_y: y });
      fetch(`/api/todos/${t.id}/position`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ x, y }),
      }).catch(() => {
        placingRef.current.delete(t.id);
      });
    }
  }, [canvasTodos, onLocalPatch]);

  // ------------------------------------------------------------------------ drag

  // A press anywhere on the card that isn't a real control starts a drag — including on
  // the title, which is most of the card's surface. Title *editing* is then a click that
  // didn't move: anything past DRAG_SLOP is a drag, anything under it opens the editor.
  // (Reserving the title as a no-drag zone made cards feel undraggable, since the title
  // is the obvious thing to grab.)
  const DRAG_SLOP = 3;
  // The live drag is written straight to the dragged card's own transform — no React
  // state per pointermove, since that re-rendered the whole dashboard (every card, every
  // lane) on each frame and the card visibly trailed the cursor. State catches up once,
  // on drop.
  // `group` is every card the drag is carrying: just the grabbed one normally, or the
  // whole marquee selection when you grab a card that belongs to it.
  const dragRef = useRef<{
    id: number;
    el: HTMLElement;
    group: { id: number; el: HTMLElement; originX: number; originY: number }[];
    startX: number;
    startY: number;
    originX: number;
    originY: number;
    onTitle: boolean;
    moved: boolean;
  } | null>(null);

  const handleCardPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>, todo: Todo) => {
      // Checkbox, action buttons and the title input keep their own clicks.
      if ((e.target as HTMLElement).closest("[data-no-drag]")) return;
      if (e.button !== 0) return;
      e.stopPropagation();
      const el = e.currentTarget as HTMLElement;
      el.setPointerCapture(e.pointerId);
      // Grabbing a card from outside the selection means you've moved on from it.
      const selected = selectedRef.current;
      if (!selected.has(todo.id) && selected.size > 0) setSelection(new Set());
      const layer = layerRef.current;
      dragRef.current = {
        id: todo.id,
        el,
        group:
          selected.has(todo.id) && selected.size > 1 && layer
            ? [...selected].flatMap((id) => {
                const node = layer.querySelector<HTMLElement>(`[data-task-card="${id}"]`);
                const t = todosRef.current.find((x) => x.id === id);
                return node && t ? [{ id, el: node, originX: t.canvas_x ?? 0, originY: t.canvas_y ?? 0 }] : [];
              })
            : [{ id: todo.id, el, originX: todo.canvas_x ?? 0, originY: todo.canvas_y ?? 0 }],
        startX: e.clientX,
        startY: e.clientY,
        originX: todo.canvas_x ?? 0,
        originY: todo.canvas_y ?? 0,
        onTitle: Boolean((e.target as HTMLElement).closest("[data-card-title]")),
        moved: false,
      };
    },
    [setSelection],
  );

  const handleCardPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      // Excalidraw sits underneath and does its own hover hit-testing on every
      // pointermove it sees. While a card is in hand, that work is pure jank — keep the
      // move to ourselves.
      e.stopPropagation();
      const dx = e.clientX - drag.startX;
      const dy = e.clientY - drag.startY;
      if (!drag.moved && Math.abs(dx) < DRAG_SLOP && Math.abs(dy) < DRAG_SLOP) return;
      if (!drag.moved) {
        drag.moved = true;
        // Take the cards out of the shared 500ms transition and onto their own compositor
        // layer for the duration of the drag, so they track the cursor exactly.
        for (const g of drag.group) {
          g.el.style.transition = "none";
          g.el.style.willChange = "transform";
          g.el.style.zIndex = "2";
          // backdrop-blur re-reads and re-blurs whatever is behind the card at every new
          // position — the single most expensive thing about moving this element. The card
          // is bg-card/95 anyway, so dropping it mid-drag is invisible and buys the frames.
          g.el.style.backdropFilter = "none";
        }
        // Pause the dashboard's 1s clock tick: a re-render of every card and lane lands
        // as a dropped frame right under the cursor.
        document.body.dataset.draggingCard = "1";
      }
      // Written straight through rather than batched into a rAF: pointermove is already
      // delivered once per frame, and deferring it put the card a frame behind the
      // cursor. `transform` alone doesn't invalidate layout, so extra writes are cheap.
      const { zoom } = viewRef.current;
      const transform = `translate3d(${dx / zoom}px, ${dy / zoom}px, 0)`;
      for (const g of drag.group) g.el.style.transform = transform;
    },
    [],
  );

  const handleCardPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const drag = dragRef.current;
      if (!drag) return;
      dragRef.current = null;
      delete document.body.dataset.draggingCard;
      if ((e.currentTarget as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
      }
      if (!drag.moved) {
        // A press that never moved: on the title, that's "edit me".
        if (drag.onTitle && e.type === "pointerup") {
          const todo = todosRef.current.find((t) => t.id === drag.id);
          setEditingId(drag.id);
          setEditTitle(todo?.title ?? "");
        }
        return;
      }
      const { zoom } = viewRef.current;
      const dropX = (e.clientX - drag.startX) / zoom;
      const dropY = (e.clientY - drag.startY) / zoom;
      // One toast for the drop, however many cards it carried.
      let failed = false;
      for (const g of drag.group) {
        const x = g.originX + dropX;
        const y = g.originY + dropY;
        // Hand the offset back to left/top in the same tick the transform is cleared, so
        // each card stays exactly where it was let go.
        g.el.style.transform = "";
        g.el.style.transition = "";
        g.el.style.willChange = "";
        g.el.style.zIndex = "";
        g.el.style.backdropFilter = "";
        onLocalPatch(g.id, { canvas_x: x, canvas_y: y });
        fetch(`/api/todos/${g.id}/position`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ x, y }),
        }).catch(() => {
          if (!failed) toast.error("Couldn't save card position.");
          failed = true;
        });
      }
    },
    [onLocalPatch],
  );

  // ------------------------------------------------------------------- add a task

  const createTask = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      const title = newTitle.trim();
      if (!title || creating) return;
      const at = composer;
      setCreating(true);
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title,
            estimated_minutes: newEstimate,
            // Cards spawned on the board keep the spot you picked; the toolbar composer
            // leaves placement to the inbox columns.
            ...(at?.at === "board" ? { canvas_x: at.sceneX, canvas_y: at.sceneY } : {}),
          }),
        });
        if (!res.ok) throw new Error();
        const todo: Todo = await res.json();
        onCreated(todo);
        setNewTitle("");
        // A board composer has used up its spot — a second task would land on top of the
        // first — so it closes. The toolbar one stays open for rapid entry.
        if (at?.at === "board") setComposer(null);
        else composerRef.current?.focus();
      } catch {
        toast.error("Couldn't add task.");
      } finally {
        setCreating(false);
      }
    },
    [composer, creating, newEstimate, newTitle, onCreated],
  );

  useEffect(() => {
    if (composer) composerRef.current?.focus();
  }, [composer]);

  // Right-click → Duplicate. Copies the fields that describe the *work* (title, estimate,
  // priority, category, recurrence) and drops the copy one card-width to the right, so it
  // reads as a sibling instead of hiding under the original. Live state — done, timers,
  // working/waiting — deliberately doesn't come along.
  const duplicateTask = useCallback(
    async (todo: Todo) => {
      try {
        const res = await fetch("/api/todos", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: todo.title,
            priority: todo.priority,
            recurrence: todo.recurrence ?? "none",
            estimated_minutes: todo.estimated_minutes,
            category: todo.category,
            color: todo.color,
            ...(todo.canvas_x != null && todo.canvas_y != null
              ? { canvas_x: todo.canvas_x + CARD_W + CARD_GAP, canvas_y: todo.canvas_y }
              : {}),
          }),
        });
        if (!res.ok) throw new Error();
        onCreated(await res.json());
      } catch {
        toast.error("Couldn't duplicate task.");
      }
    },
    [onCreated],
  );

  // ------------------------------------------------- spawn a task where you're looking

  // Container-relative pointer position, so "N" can drop a card under the cursor rather
  // than at some arbitrary default.
  const pointerRef = useRef<{ x: number; y: number } | null>(null);

  const spawnAt = useCallback((clientX: number, clientY: number): Spawn => {
    const rect = wrapRef.current!.getBoundingClientRect();
    const { scrollX, scrollY, zoom } = viewRef.current;
    const left = clientX - rect.left;
    const top = clientY - rect.top;
    // Excalidraw maps scene → viewport as (scene + scroll) * zoom; invert it.
    return { left, top, sceneX: left / zoom - scrollX, sceneY: top / zoom - scrollY };
  }, []);

  const openBoardComposer = useCallback(
    (clientX: number, clientY: number) => {
      setBoardMenu(null);
      setNewTitle("");
      setComposer({ at: "board", ...spawnAt(clientX, clientY) });
    },
    [spawnAt],
  );

  // "N" anywhere on the board opens the composer under the cursor. Captured on window so
  // Excalidraw's own document-level shortcuts never see the key.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "n" && e.key !== "N") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      // Never steal the letter from anything you can type into — our own inputs,
      // Excalidraw's text tool, the chat box.
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      const host = wrapRef.current;
      if (!host || !host.isConnected || host.offsetParent === null) return;
      e.preventDefault();
      e.stopPropagation();
      const rect = host.getBoundingClientRect();
      const p = pointerRef.current;
      // Off-canvas (or no pointer yet) → drop it in the middle of what you're looking at.
      const inside = p && p.x >= rect.left && p.x <= rect.right && p.y >= rect.top && p.y <= rect.bottom;
      openBoardComposer(
        inside ? p!.x : rect.left + rect.width / 2,
        inside ? p!.y : rect.top + rect.height / 2,
      );
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [openBoardComposer]);

  useEffect(() => {
    const onPointerMove = (e: PointerEvent) => {
      pointerRef.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  // Right-click on bare canvas offers "New task here" instead of Excalidraw's canvas
  // menu. Cards keep their own menu (they stop the event), and Excalidraw's toolbar and
  // element menus are untouched — only hits on the raw <canvas> are intercepted.
  useEffect(() => {
    const host = cardHost;
    if (!host) return;
    const onContextMenu = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.tagName !== "CANVAS") return;
      // A right-click with something selected is Excalidraw's business (copy, layer
      // order, delete) — don't hijack it.
      if ((api?.getAppState().selectedElementIds &&
        Object.keys(api.getAppState().selectedElementIds).length > 0)) return;
      e.preventDefault();
      e.stopPropagation();
      setBoardMenu(spawnAt(e.clientX, e.clientY));
    };
    host.addEventListener("contextmenu", onContextMenu, true);
    return () => host.removeEventListener("contextmenu", onContextMenu, true);
  }, [api, cardHost, spawnAt]);

  // Escape / a click elsewhere dismisses the board menu.
  useEffect(() => {
    if (!boardMenu) return;
    const close = () => setBoardMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("pointerdown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [boardMenu]);

  // Centres the view on the task cards — the way back when you've wandered off into
  // empty canvas. Excalidraw's own scrollToContent only knows about its elements.
  const fitToCards = useCallback(() => {
    const placed = canvasTodos.filter((t) => t.canvas_x != null && t.canvas_y != null);
    const host = wrapRef.current;
    if (!api || placed.length === 0 || !host) return;
    const minX = Math.min(...placed.map((t) => t.canvas_x!));
    const maxX = Math.max(...placed.map((t) => t.canvas_x! + CARD_W));
    const minY = Math.min(...placed.map((t) => t.canvas_y!));
    const maxY = Math.max(...placed.map((t) => t.canvas_y! + estimateCardHeight(t)));
    // Extra headroom up top so recentring doesn't tuck the first row under our
    // toolbar or Excalidraw's.
    const pad = 60;
    const padTop = 120;
    const w = host.clientWidth;
    const h = host.clientHeight;
    const zoom = Math.min(1.2, Math.max(0.2, Math.min(w / (maxX - minX + pad * 2), h / (maxY - minY + padTop + pad))));
    api.updateScene({
      appState: {
        zoom: { value: zoom as never },
        scrollX: (w / zoom - (maxX - minX)) / 2 - minX,
        scrollY: padTop / zoom - minY,
      },
    });
  }, [api, canvasTodos]);

  // ---------------------------------------------------------------------- render

  // The counter covers everything on the Tasks screen, lane included — it's "how much
  // did I get done today", not "how many cards are on the canvas".
  const doneToday = useMemo(() => todos.filter(isDoneToday).length, [todos]);

  // One composer, two homes (toolbar dropdown / floating on the board). Only ever one is
  // mounted at a time, so sharing the element keeps the input state and focus simple.
  const composerForm = (
    <form
      onSubmit={createTask}
      className="pointer-events-auto rounded-xl border bg-card/95 p-2 shadow-lg backdrop-blur-sm"
    >
      <Input
        ref={composerRef}
        value={newTitle}
        onChange={(e) => setNewTitle(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setComposer(null);
        }}
        placeholder="Add a task…"
        className="h-7 text-xs"
      />
      <div className="mt-1.5 flex items-center gap-1">
        {ESTIMATE_OPTIONS.map((m) => (
          <Badge
            key={m}
            asChild
            variant={newEstimate === m ? "default" : "outline"}
            className="h-5 cursor-pointer px-1.5 text-[10px]"
          >
            <button type="button" onClick={() => setNewEstimate(m)}>
              {formatEstimateLabel(m)}
            </button>
          </Badge>
        ))}
        <Button type="submit" size="sm" className="ml-auto h-5 px-2 text-[10px]" disabled={creating}>
          Add
        </Button>
      </div>
    </form>
  );

  // Keep a popover from hanging off the right or bottom edge of the board.
  const clampLeft = (left: number) => {
    const w = wrapRef.current?.clientWidth ?? 0;
    return Math.max(8, w ? Math.min(left, Math.max(8, w - (CARD_W + 24))) : left);
  };
  const clampTop = (top: number) => {
    const h = wrapRef.current?.clientHeight ?? 0;
    return Math.max(8, h ? Math.min(top, Math.max(8, h - 110)) : top);
  };

  const cards = canvasTodos.map((todo) => {
    const done = isDoneToday(todo) || completingIds.has(todo.id);
    const selected = selectedIds.has(todo.id);
    const running = Boolean(todo.timer_started_at);
    const remaining = remainingSeconds(todo, nowTick);
    const overdue = remaining !== null && remaining < 0;
    return (
      // Right-click is where the fields that don't earn a permanent spot on the card
      // live — recurrence, category, estimate. The card face stays note-like.
      <ContextMenu key={todo.id}>
        <ContextMenuTrigger asChild>
      <div
        data-task-card={todo.id}
        onPointerDown={(e) => handleCardPointerDown(e, todo)}
        onPointerMove={handleCardPointerMove}
        onPointerUp={handleCardPointerUp}
        onPointerCancel={handleCardPointerUp}
        style={{
          position: "absolute",
          left: todo.canvas_x ?? 0,
          top: todo.canvas_y ?? 0,
          width: CARD_W,
          pointerEvents: drawing ? "none" : "auto",
          // Without this the browser claims a touch drag as a pan/scroll gesture and
          // fires pointercancel a few pixels in, so cards feel like they slip.
          touchAction: "none",
        }}
        className={cn(
          // Deliberately not `transition-all`: left/top must never animate, or a dropped
          // card slides in from where the drag started.
          "group cursor-grab select-none rounded-xl border bg-card/95 px-3 py-2 shadow-sm backdrop-blur-sm transition-[opacity,transform,color,background-color,border-color,box-shadow] duration-500 active:cursor-grabbing",
          // A hand-picked colour paints the whole card (see lib/task-colors.ts). It wins
          // the border back from the live-state styles below — the ring still marks
          // "working on now", so nothing is lost by letting the colour show.
          todo.color && !done && CARD_COLOR_CLASSES[todo.color],
          todo.in_progress && !done && "ring-1 ring-primary/25",
          todo.in_progress && !done && !todo.color && "border-primary/60",
          todo.waiting && !todo.in_progress && !done && !todo.color && "border-slate-400/70 dark:border-slate-400/50",
          // Marquee selection. A solid ring beats a tint here: it reads the same on every
          // card colour, and it stacks with the softer "working on now" ring above.
          selected && !done && "ring-2 ring-primary ring-offset-1 ring-offset-background",
          // Checked off: fade and shrink away over the window the parent holds the card
          // open for, so it visibly leaves rather than blinking out.
          done && "scale-95 opacity-0",
        )}
      >
        <div className="flex items-start gap-2">
          <div data-no-drag className="pt-0.5">
            <Checkbox
              checked={done}
              aria-label={done ? `Uncheck ${todo.title}` : `Check off ${todo.title}`}
              onCheckedChange={(checked) => (checked ? onComplete(todo.id) : onUncomplete(todo.id))}
            />
          </div>
          <div className="min-w-0 flex-1">
            {editingId === todo.id ? (
              <div data-no-drag>
                <Input
                  autoFocus
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  onBlur={() => {
                    const title = editTitle.trim();
                    if (title && title !== todo.title) onUpdate(todo.id, { title });
                    setEditingId(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    if (e.key === "Escape") setEditingId(null);
                  }}
                  className="h-6 px-1 text-[13px]"
                />
              </div>
            ) : (
              // Deliberately not data-no-drag: the title is the natural place to grab a
              // card, so it drags, and the pointer-up handler opens the editor when the
              // press didn't move.
              <div
                data-card-title
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setEditingId(todo.id);
                    setEditTitle(todo.title);
                  }
                }}
                className={cn(
                  "block w-full text-left text-[13px] font-medium leading-snug",
                  done && "line-through text-muted-foreground",
                )}
              >
                {todo.title}
              </div>
            )}
            <div className="mt-1 flex flex-wrap items-center gap-1">
              {/* The priority dot doubles as the priority control: click cycles it. */}
              <button
                data-no-drag
                type="button"
                title={`Priority: ${todo.priority} — click to change`}
                aria-label={`Priority ${todo.priority}, click to change`}
                onClick={() =>
                  onUpdate(todo.id, {
                    priority: PRIORITIES[(PRIORITIES.indexOf(todo.priority) + 1) % PRIORITIES.length],
                  })
                }
                className={cn("size-2 rounded-full ring-offset-1 hover:ring-1 hover:ring-ring", PRIORITY_DOT[todo.priority])}
              />
              {todo.recurrence && todo.recurrence !== "none" && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-muted-foreground">
                  <RepeatIcon className="size-2.5" />
                  {todo.recurrence}
                </span>
              )}
              {todo.category && (
                <Badge variant="outline" className={cn("h-4 px-1 text-[9px]", CATEGORY_BADGE_CLASS[todo.category])}>
                  {TASK_CATEGORY_LABELS[todo.category]}
                </Badge>
              )}
              {todo.estimated_minutes ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[10px] tabular-nums",
                    running ? (overdue ? "text-priority-urgent" : "text-primary") : "text-muted-foreground",
                  )}
                >
                  <ClockIcon className="size-2.5" />
                  {remaining !== null && (running || (todo.time_spent_seconds ?? 0) > 0)
                    ? `${overdue ? "-" : ""}${formatCountdown(Math.abs(remaining))}`
                    : formatEstimateLabel(todo.estimated_minutes)}
                </span>
              ) : null}
            </div>
            {/* The newest note on this task — an agent's hand-off, or Berto's own.
                Sits under the chips because it's prose and needs the full width. */}
            <TaskLatestUpdate todo={todo} className="mt-1.5" />
            {composingId === todo.id && (
              <TaskUpdateComposer
                taskId={todo.id}
                className="mt-1.5"
                onClose={() => setComposingId(null)}
                onPosted={(u) =>
                  onLocalPatch(todo.id, {
                    last_update: u.body,
                    last_update_by: u.author,
                    last_update_at: u.created_at,
                  })
                }
              />
            )}
          </div>
          {/* Actions stay hidden until hover so the card reads as a note, not a widget —
              unless the task is live (working / waiting / timing), in which case the
              lit-up control is the status indicator. */}
          <div
            data-no-drag
            className={cn(
              "grid shrink-0 grid-cols-2 gap-0.5 transition-opacity focus-within:opacity-100 group-hover:opacity-100",
              todo.in_progress || todo.waiting || running ? "opacity-100" : "opacity-0",
            )}
          >
            {!done && (
              <>
                <button
                  type="button"
                  onClick={() => onToggleInProgress(todo.id, !todo.in_progress)}
                  aria-label={todo.in_progress ? `Stop working on ${todo.title}` : `Work on ${todo.title} now`}
                  title="Working on now"
                  className={cn(
                    "rounded p-0.5 hover:bg-muted",
                    todo.in_progress ? "text-primary opacity-100" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <TargetIcon className="size-3" />
                </button>
                <button
                  type="button"
                  onClick={() => onToggleWaiting(todo.id, !todo.waiting)}
                  aria-label={todo.waiting ? `Stop waiting on ${todo.title}` : `Mark ${todo.title} as waiting`}
                  title="Waiting on something"
                  className={cn(
                    "rounded p-0.5 hover:bg-muted",
                    // Slate, not amber: amber now belongs to the yellow card colour, and
                    // "waiting" shouldn't read as the same signal as a pending card.
                    todo.waiting ? "text-slate-500 opacity-100 dark:text-slate-300" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <HourglassIcon className="size-3" />
                </button>
              </>
            )}
            {!done && todo.estimated_minutes ? (
              <button
                type="button"
                onClick={() => onToggleTimer(todo)}
                aria-label={running ? `Pause timer for ${todo.title}` : `Start timer for ${todo.title}`}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {running ? <PauseIcon className="size-3" /> : <PlayIcon className="size-3" />}
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => onDelete(todo.id)}
              aria-label={`Delete ${todo.title}`}
              className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-priority-urgent"
            >
              <TrashIcon className="size-3" />
            </button>
          </div>
        </div>
      </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-52">
          {/* The second way to finish a task: crossed off today, standing again
              tomorrow. Sits above everything else because it *ends* the card. */}
          <ContextMenuItem onSelect={() => onComplete(todo.id, { repeat: true })}>
            <RepeatIcon className="size-3.5" />
            Done &amp; repeat tomorrow
          </ContextMenuItem>
          {/* Done for now, but it needs a second pass: cross it off and queue an
              identical task for the day the follow-up is due. */}
          <ContextMenuSub>
            <ContextMenuSubTrigger>
              <CalendarClockIcon className="size-3.5" />
              Complete &amp; follow up
            </ContextMenuSubTrigger>
            <ContextMenuSubContent>
              {FOLLOW_UP_OPTIONS.map((o) => (
                <ContextMenuItem key={o.days} onSelect={() => onComplete(todo.id, { followUpDays: o.days })}>
                  {o.label}
                </ContextMenuItem>
              ))}
            </ContextMenuSubContent>
          </ContextMenuSub>
          <ContextMenuSeparator />
          {/* Colour first: it's the one thing here that's purely about how the board
              *looks*, and it's the most-reached-for item. Yellow = pending, green =
              in progress by convention — the code doesn't enforce it. */}
          <ContextMenuLabel className="text-xs">Colour</ContextMenuLabel>
          <div className="flex items-center gap-1 px-2 pb-1">
            {CARD_COLORS.map((c) => (
              <ContextMenuItem
                key={c}
                aria-label={CARD_COLOR_LABELS[c]}
                title={CARD_COLOR_LABELS[c]}
                onSelect={() => onUpdate(todo.id, { color: todo.color === c ? null : (c as CardColor) })}
                className={cn(
                  "size-5 shrink-0 justify-center rounded-full border p-0",
                  CARD_COLOR_SWATCH_CLASSES[c],
                  todo.color === c ? "ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover" : "border-black/10",
                )}
              />
            ))}
            {/* Clears the colour — the plain card surface, shown as an empty swatch. */}
            <ContextMenuItem
              aria-label="No colour"
              title="No colour"
              onSelect={() => onUpdate(todo.id, { color: null })}
              className={cn(
                "size-5 shrink-0 justify-center rounded-full border border-border bg-card p-0",
                !todo.color && "ring-2 ring-foreground/60 ring-offset-1 ring-offset-popover",
              )}
            />
          </div>
          <ContextMenuSeparator />
          <ContextMenuLabel className="text-xs">Repeats</ContextMenuLabel>
          <ContextMenuRadioGroup
            value={todo.recurrence ?? "none"}
            onValueChange={(v) => onUpdate(todo.id, { recurrence: v as Todo["recurrence"] })}
          >
            {(["none", "daily", "weekly", "monthly"] as const).map((r) => (
              <ContextMenuRadioItem key={r} value={r} className="text-xs capitalize">
                {r === "none" ? "One-off" : r}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuLabel className="text-xs">Category</ContextMenuLabel>
          <ContextMenuRadioGroup
            value={todo.category ?? "none"}
            onValueChange={(v) => onUpdate(todo.id, { category: v === "none" ? null : (v as TaskCategory) })}
          >
            <ContextMenuRadioItem value="none" className="text-xs">
              None
            </ContextMenuRadioItem>
            {TASK_CATEGORIES.map((c) => (
              <ContextMenuRadioItem key={c} value={c} className="text-xs">
                {TASK_CATEGORY_LABELS[c]}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          <ContextMenuLabel className="text-xs">Estimate</ContextMenuLabel>
          <ContextMenuRadioGroup
            value={String(todo.estimated_minutes ?? "")}
            onValueChange={(v) => onUpdate(todo.id, { estimated_minutes: Number(v) })}
          >
            {ESTIMATE_OPTIONS.map((m) => (
              <ContextMenuRadioItem key={m} value={String(m)} className="text-xs">
                {formatEstimateLabel(m)}
              </ContextMenuRadioItem>
            ))}
          </ContextMenuRadioGroup>
          <ContextMenuSeparator />
          {/* Only offered once it's been taken off the pinned window — putting it
              back is the way home from "Remove from pinned" there. */}
          {todo.pinned_hidden_at && (
            <ContextMenuItem className="text-xs" onSelect={() => onSetPinned(todo.id, true)}>
              <PinIcon className="size-3" />
              Show in pinned window
            </ContextMenuItem>
          )}
          {/* Berto's side of the update thread — agents post theirs over MCP. */}
          <ContextMenuItem className="text-xs" onSelect={() => setComposingId(todo.id)}>
            <MessageSquarePlusIcon className="size-3" />
            {todo.last_update ? "Post an update" : "Add an update"}
          </ContextMenuItem>
          <ContextMenuItem className="text-xs" onClick={() => duplicateTask(todo)}>
            <CopyIcon className="size-3" />
            Duplicate
          </ContextMenuItem>
          <ContextMenuItem variant="destructive" className="text-xs" onClick={() => onDelete(todo.id)}>
            <TrashIcon className="size-3" />
            Delete task
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
    );
  });

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {sceneLoading || !initialScene ? (
        <Skeleton className="h-full w-full" />
      ) : (
        <Excalidraw
          excalidrawAPI={setApi}
          onChange={handleChange as never}
          theme={resolvedTheme === "dark" ? "dark" : "light"}
          initialData={{
            elements: initialScene.elements,
            // gridSize is nullable in the stored scene but only optional in AppState,
            // so a persisted `null` (grid off) has to become `undefined`.
            appState: {
              viewBackgroundColor: initialScene.appState.viewBackgroundColor,
              gridSize: initialScene.appState.gridSize ?? undefined,
              viewModeEnabled: false,
            },
            files: initialScene.files,
            scrollToContent: false,
          }}
        />
      )}

      {/* The task cards, portaled inside the Excalidraw container so they sit above the
          drawing canvases but below Excalidraw's own toolbar — and so wheel events over
          a card still reach Excalidraw and pan/zoom the whole notebook together. */}
      {cardHost &&
        createPortal(
          <div
            ref={layerRef}
            style={{
              position: "absolute",
              inset: 0,
              transformOrigin: "0 0",
              zIndex: CARD_LAYER_Z,
              // The layer spans the whole canvas, so it must stay inert — otherwise it
              // swallows every click on empty canvas and Excalidraw never sees them.
              // Only the cards themselves opt back in, and even they go inert while a
              // drawing tool is active so you can scribble straight across them.
              pointerEvents: "none",
            }}
            className={cn(drawing && "opacity-90")}
          >
            {cards}
          </div>,
          cardHost,
        )}

      {/* The pipelines (Content, Code, Community, Sales): pinned to the canvas rather
          than drawn on it, so they hold their place while the notebook pans. */}
      <PipelineLanes
        todos={todos}
        collapsed={laneCollapsed}
        onToggleCollapsed={toggleLane}
        completingIds={completingIds}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onToggleInProgress={onToggleInProgress}
        onDelete={onDelete}
        onUpdate={onUpdate}
        onCreated={onCreated}
      />

      {/* Our own controls, kept clear of Excalidraw's toolbar (top centre) and zoom
          controls (bottom left). */}
      <div
        style={{ left: laneCollapsed ? LANE_CLOSED_OFFSET : LANE_OPEN_OFFSET }}
        className="pointer-events-none absolute top-3 z-[5] flex max-w-[min(22rem,calc(100%-6rem))] flex-col gap-2 transition-[left] duration-150"
      >
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            title="Add a task (or press N to drop one under your cursor)"
            onClick={() => setComposer((c) => (c ? null : { at: "toolbar" }))}
          >
            <PlusIcon className="size-3.5" />
            Task
          </Button>
          <Button
            size="sm"
            variant="secondary"
            className="h-7 gap-1 px-2 text-xs"
            onClick={fitToCards}
            title="Centre the view on your task cards"
          >
            <CrosshairIcon className="size-3.5" />
            Find tasks
          </Button>
          {/* The score. Replaced a plain "done/open today" counter: what actually
              pulls the next task out of you is the streak and how close today is to
              banking (app/_components/streak-chip.tsx). */}
          {!loading && <StreakChip />}
          {/* The chip owns "how many today"; this is just the size of the pile. */}
          {!loading && (
            <span className="rounded-md bg-background/80 px-1.5 py-0.5 text-[11px] whitespace-nowrap text-muted-foreground backdrop-blur-sm">
              {todos.length - doneToday} open
            </span>
          )}
        </div>
        {composer?.at === "toolbar" && composerForm}
      </div>

      {/* Right-click on empty canvas: one item, and it advertises the shortcut. */}
      {boardMenu && (
        <div
          style={{ left: clampLeft(boardMenu.left), top: clampTop(boardMenu.top) }}
          onPointerDown={(e) => e.stopPropagation()}
          className="absolute z-[6] w-40 overflow-hidden rounded-lg border bg-popover p-1 shadow-lg"
        >
          <button
            type="button"
            autoFocus
            onClick={() => openBoardComposer(...menuClientPoint(boardMenu, wrapRef.current))}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-xs hover:bg-accent"
          >
            <PlusIcon className="size-3.5" />
            New task here
            <kbd className="ml-auto rounded border px-1 text-[10px] text-muted-foreground">N</kbd>
          </button>
        </div>
      )}

      {/* What a multi-selection is *for*: the handful of edits worth making to a stack of
          cards at once. Anything more particular stays on the single-card right-click
          menu. Sits bottom-centre, clear of Excalidraw's zoom controls (bottom left). */}
      {selectedIds.size > 1 && (
        <div className="absolute bottom-4 left-1/2 z-[7] flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-popover/95 px-2.5 py-1.5 shadow-lg backdrop-blur-sm">
          <span className="px-1 text-xs font-medium tabular-nums">{selectedIds.size} selected</span>
          <span className="h-4 w-px bg-border" />
          {CARD_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              title={CARD_COLOR_LABELS[c]}
              aria-label={`Colour ${selectedIds.size} tasks ${CARD_COLOR_LABELS[c]}`}
              onClick={() => bulkUpdate({ color: c as CardColor })}
              className={cn("size-4 shrink-0 rounded-full border border-black/10", CARD_COLOR_SWATCH_CLASSES[c])}
            />
          ))}
          <button
            type="button"
            title="No colour"
            aria-label={`Clear the colour on ${selectedIds.size} tasks`}
            onClick={() => bulkUpdate({ color: null })}
            className="size-4 shrink-0 rounded-full border border-border bg-card"
          />
          <span className="h-4 w-px bg-border" />
          {PRIORITIES.map((pr) => (
            <button
              key={pr}
              type="button"
              title={`Priority: ${pr}`}
              aria-label={`Set ${selectedIds.size} tasks to ${pr} priority`}
              onClick={() => bulkUpdate({ priority: pr })}
              className={cn("size-2.5 shrink-0 rounded-full ring-offset-1 hover:ring-1 hover:ring-ring", PRIORITY_DOT[pr])}
            />
          ))}
          <span className="h-4 w-px bg-border" />
          <Button size="sm" variant="secondary" className="h-6 gap-1 px-2 text-[11px]" onClick={bulkComplete}>
            <CheckIcon className="size-3" />
            Complete
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-6 gap-1 px-2 text-[11px] text-priority-urgent hover:text-priority-urgent"
            onClick={bulkDelete}
          >
            <TrashIcon className="size-3" />
            Delete
          </Button>
          <button
            type="button"
            aria-label="Clear selection"
            title="Clear selection (Esc)"
            onClick={() => setSelection(new Set())}
            className="rounded-full p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}

      {/* The board composer: same form, parked where you asked for the card. */}
      {composer?.at === "board" && (
        <div
          style={{ left: clampLeft(composer.left), top: clampTop(composer.top), width: CARD_W + 16 }}
          className="absolute z-[6]"
        >
          {composerForm}
        </div>
      )}
    </div>
  );
}

// The menu stores container-relative coords; re-derive client coords so the composer it
// opens lands on exactly the same spot.
function menuClientPoint(spawn: Spawn, host: HTMLElement | null): [number, number] {
  const rect = host?.getBoundingClientRect();
  return [(rect?.left ?? 0) + spawn.left, (rect?.top ?? 0) + spawn.top];
}

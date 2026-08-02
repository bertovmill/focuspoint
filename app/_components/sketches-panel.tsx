"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUpRightIcon,
  BrushIcon,
  CircleIcon,
  CopyIcon,
  DownloadIcon,
  EraserIcon,
  KeyboardIcon,
  MinusIcon,
  MousePointer2Icon,
  PencilIcon,
  PenLineIcon,
  SquareIcon,
  TrashIcon,
  TypeIcon,
  Undo2Icon,
  XIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "lucide-react";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

interface Sketch {
  id: number;
  title: string;
  image_data: string;
  created_at: string;
  updated_at: string;
}

// Logical canvas size — CSS scales it to fit the panel, pointer coords are mapped back.
const CANVAS_W = 1200;
const CANVAS_H = 900;
const MAX_UNDO = 30;
const MIN_SIZE = 1;
const MAX_SIZE = 30;
const MIN_ZOOM = 0.25;
const MAX_ZOOM = 8;
// Wheel deltas vary wildly by device (a single Chrome trackpad pinch tick is ~120),
// so damp them and cap each event's step — otherwise one pinch slams to MAX_ZOOM.
const WHEEL_ZOOM_SENSITIVITY = 0.0025;
const MAX_WHEEL_STEP = 1.25;

const COLORS = ["#1a1a1a", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#9333ea"];

type Tool = "select" | "pen" | "eraser" | "rect" | "ellipse" | "line" | "arrow" | "text";

// A marquee selection over the raster canvas, in logical canvas coords.
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// Smaller than this (logical px) counts as a click, not a selection drag.
const MIN_SELECTION = 6;

const normRect = (a: { x: number; y: number }, b: { x: number; y: number }): Rect => ({
  x: Math.min(a.x, b.x),
  y: Math.min(a.y, b.y),
  w: Math.abs(b.x - a.x),
  h: Math.abs(b.y - a.y),
});

const clampRect = (r: Rect): Rect => {
  const x = Math.max(0, Math.min(CANVAS_W, r.x));
  const y = Math.max(0, Math.min(CANVAS_H, r.y));
  return { x, y, w: Math.min(r.w, CANVAS_W - x), h: Math.min(r.h, CANVAS_H - y) };
};

// `hotkey` follows Figma/Miro muscle memory (V select, P pen, R rect, O ellipse, T text…).
const TOOLS: { key: Tool; label: string; icon: typeof BrushIcon; hotkey: string }[] = [
  { key: "select", label: "Select", icon: MousePointer2Icon, hotkey: "v" },
  { key: "pen", label: "Pen", icon: PenLineIcon, hotkey: "p" },
  { key: "eraser", label: "Eraser", icon: EraserIcon, hotkey: "e" },
  { key: "rect", label: "Rectangle", icon: SquareIcon, hotkey: "r" },
  { key: "ellipse", label: "Ellipse", icon: CircleIcon, hotkey: "o" },
  { key: "line", label: "Line", icon: MinusIcon, hotkey: "l" },
  { key: "arrow", label: "Arrow", icon: ArrowUpRightIcon, hotkey: "a" },
  { key: "text", label: "Text", icon: TypeIcon, hotkey: "t" },
];

const TOOL_BY_HOTKEY: Record<string, Tool> = Object.fromEntries(TOOLS.map((t) => [t.hotkey, t.key]));

// App-wide single-letter hotkeys (layout.tsx) that the canvas swallows while sketching.
const SUPPRESSED_GLOBAL_KEYS = new Set(["n", "c"]);

// Rendered in the "?" cheat sheet. Grouped the way Figma/Miro present theirs.
const SHORTCUT_GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Tools", items: TOOLS.map((t) => [t.hotkey.toUpperCase(), t.label] as [string, string]) },
  {
    title: "Edit",
    items: [
      ["⌘Z", "Undo"],
      ["⌘D", "Duplicate selection"],
      ["Delete", "Delete selection"],
      ["Esc", "Deselect / cancel"],
    ],
  },
  {
    title: "View",
    items: [
      ["⌘+ / ⌘−", "Zoom in / out"],
      ["⇧0", "Reset to 100%"],
      ["Space + drag", "Pan the canvas"],
      ["Pinch", "Zoom at the cursor"],
      ["?", "This cheat sheet"],
    ],
  },
];

// Text-tool font size scales with the line-weight slider.
const fontSizeFor = (size: number) => Math.min(180, Math.max(20, size * 6));

export function SketchesPanel() {
  const [sketches, setSketches] = useState<Sketch[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [color, setColor] = useState(COLORS[0]);
  const [size, setSize] = useState(7);
  const [tool, setTool] = useState<Tool>("pen");
  const [title, setTitle] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [canUndo, setCanUndo] = useState(false);
  // Bumped on every edit so the autosave debounce effect can reset its timer even when `dirty` was already true.
  const [editVersion, setEditVersion] = useState(0);
  const markDirty = useCallback(() => {
    setDirty(true);
    setEditVersion((v) => v + 1);
  }, []);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Space-to-pan (Figma/Miro): held space swaps the canvas into a grab cursor and makes
  // drags move the viewport instead of drawing. The ref is what the pointer handlers read.
  const [spacePan, setSpacePan] = useState(false);
  const spacePanRef = useRef(false);
  const panDragRef = useRef<{ start: { x: number; y: number }; pan0: { x: number; y: number } } | null>(null);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Pending text placement: logical canvas coords + container-relative CSS position.
  const [textPos, setTextPos] = useState<{ x: number; y: number; cssX: number; cssY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  // Text elements are kept as editable objects (not baked into the raster canvas) until save.
  interface TextElement {
    id: number;
    x: number;
    y: number;
    value: string;
    color: string;
    size: number;
  }
  const [texts, setTexts] = useState<TextElement[]>([]);
  const [editingTextId, setEditingTextId] = useState<number | null>(null);
  const [selectedTextId, setSelectedTextId] = useState<number | null>(null);
  const nextTextIdRef = useRef(1);

  // Select tool: `selection` is the committed marquee, `marquee` the live drag preview.
  const [selection, setSelection] = useState<Rect | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  // In-flight select gesture — either dragging out a new marquee, or moving the
  // pixels under an existing one (lifted onto `bitmap`, with the canvas minus
  // those pixels kept in `base` so each move repaints cleanly).
  const selectDragRef = useRef<
    | { mode: "marquee"; start: { x: number; y: number } }
    | { mode: "move"; start: { x: number; y: number }; rect0: Rect; bitmap: HTMLCanvasElement; base: ImageData }
    | null
  >(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const previewBaseRef = useRef<ImageData | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Active pointers (for pinch) and in-flight pinch gesture state.
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchRef = useRef<{ dist0: number; zoom0: number; mid0: { x: number; y: number }; pan0: { x: number; y: number } } | null>(null);
  const zoomRef = useRef(1);
  const panRef = useRef({ x: 0, y: 0 });
  zoomRef.current = zoom;
  panRef.current = pan;

  const getCtx = useCallback(() => canvasRef.current?.getContext("2d") ?? null, []);

  const paintBlank = useCallback((ctx: CanvasRenderingContext2D) => {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  }, []);

  // Initialize the canvas with a white "paper" background once on mount.
  useEffect(() => {
    const ctx = getCtx();
    if (ctx) paintBlank(ctx);
  }, [getCtx, paintBlank]);

  useEffect(() => {
    if (textPos) textInputRef.current?.focus();
  }, [textPos]);

  const loadSketches = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sketches");
      if (res.ok) setSketches(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSketches();
  }, [loadSketches]);

  const clampPan = useCallback((p: { x: number; y: number }, z: number) => {
    const el = containerRef.current;
    if (!el) return p;
    const w = el.clientWidth;
    const h = el.clientHeight;
    // Zoomed in: keep the edges from pulling inside the viewport. Zoomed out (z < 1):
    // the canvas is smaller than the viewport, so centre it instead of pinning top-left.
    const axis = (v: number, viewport: number) => {
      const content = viewport * z;
      return content <= viewport ? (viewport - content) / 2 : Math.min(0, Math.max(viewport - content, v));
    };
    return { x: axis(p.x, w), y: axis(p.y, h) };
  }, []);

  const applyZoom = useCallback(
    (nextZoom: number, centerCss: { x: number; y: number }) => {
      const z0 = zoomRef.current;
      const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, nextZoom));
      const p0 = panRef.current;
      // Keep the content point under `centerCss` stationary while zooming.
      const next = {
        x: centerCss.x - ((centerCss.x - p0.x) / z0) * z,
        y: centerCss.y - ((centerCss.y - p0.y) / z0) * z,
      };
      setZoom(z);
      setPan(clampPan(next, z));
    },
    [clampPan],
  );

  const zoomButtons = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      applyZoom(zoomRef.current * factor, { x: el.clientWidth / 2, y: el.clientHeight / 2 });
    },
    [applyZoom],
  );

  const resetZoom = useCallback(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, []);

  // Trackpad pinch (ctrl/cmd+wheel) zooms at the cursor; plain scroll pans when zoomed in.
  // Attached natively because React's synthetic wheel handler can't preventDefault (passive).
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      const rect = el.getBoundingClientRect();
      const cursor = { x: e.clientX - rect.left, y: e.clientY - rect.top };
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const step = Math.exp(-e.deltaY * WHEEL_ZOOM_SENSITIVITY);
        applyZoom(zoomRef.current * Math.min(MAX_WHEEL_STEP, Math.max(1 / MAX_WHEEL_STEP, step)), cursor);
      } else if (zoomRef.current > 1) {
        e.preventDefault();
        setPan(clampPan({ x: panRef.current.x - e.deltaX, y: panRef.current.y - e.deltaY }, zoomRef.current));
      }
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [applyZoom, clampPan]);

  const pointFromEvent = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    const containerRect = containerRef.current!.getBoundingClientRect();
    return {
      x: ((e.clientX - rect.left) / rect.width) * CANVAS_W,
      y: ((e.clientY - rect.top) / rect.height) * CANVAS_H,
      cssX: e.clientX - containerRect.left,
      cssY: e.clientY - containerRect.top,
    };
  }, []);

  const pushUndo = useCallback((ctx: CanvasRenderingContext2D) => {
    undoStackRef.current.push(ctx.getImageData(0, 0, CANVAS_W, CANVAS_H));
    if (undoStackRef.current.length > MAX_UNDO) undoStackRef.current.shift();
    setCanUndo(true);
  }, []);

  const strokeStyle = useCallback(
    (ctx: CanvasRenderingContext2D) => {
      ctx.strokeStyle = color;
      ctx.lineWidth = size;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
    },
    [color, size],
  );

  const drawShape = useCallback(
    (ctx: CanvasRenderingContext2D, from: { x: number; y: number }, to: { x: number; y: number }) => {
      strokeStyle(ctx);
      ctx.beginPath();
      if (tool === "rect") {
        ctx.strokeRect(Math.min(from.x, to.x), Math.min(from.y, to.y), Math.abs(to.x - from.x), Math.abs(to.y - from.y));
      } else if (tool === "ellipse") {
        ctx.ellipse((from.x + to.x) / 2, (from.y + to.y) / 2, Math.abs(to.x - from.x) / 2, Math.abs(to.y - from.y) / 2, 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        if (tool === "arrow") {
          const angle = Math.atan2(to.y - from.y, to.x - from.x);
          const head = Math.max(14, size * 3.5);
          ctx.beginPath();
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - head * Math.cos(angle - Math.PI / 6), to.y - head * Math.sin(angle - Math.PI / 6));
          ctx.moveTo(to.x, to.y);
          ctx.lineTo(to.x - head * Math.cos(angle + Math.PI / 6), to.y - head * Math.sin(angle + Math.PI / 6));
          ctx.stroke();
        }
      }
    },
    [tool, strokeStyle],
  );

  const commitText = useCallback(() => {
    if (!textPos) return;
    const value = textValue.trim();
    if (editingTextId !== null) {
      setTexts((prev) =>
        value ? prev.map((t) => (t.id === editingTextId ? { ...t, value } : t)) : prev.filter((t) => t.id !== editingTextId),
      );
      markDirty();
    } else if (value) {
      const id = nextTextIdRef.current++;
      setTexts((prev) => [...prev, { id, x: textPos.x, y: textPos.y, value, color, size }]);
      markDirty();
    }
    setTextPos(null);
    setTextValue("");
    setEditingTextId(null);
  }, [textPos, textValue, editingTextId, color, size, markDirty]);

  // Convert logical canvas coords to container-relative CSS coords (accounts for current zoom/pan).
  const canvasToCss = useCallback((x: number, y: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRect) return { x: 0, y: 0 };
    return {
      x: (x / CANVAS_W) * rect.width + (rect.left - containerRect.left),
      y: (y / CANVAS_H) * rect.height + (rect.top - containerRect.top),
    };
  }, []);

  const handleEditText = useCallback(
    (id: number) => {
      if (textPos) commitText();
      const el = texts.find((t) => t.id === id);
      if (!el) return;
      const pos = canvasToCss(el.x, el.y);
      setTextValue(el.value);
      setTextPos({ x: el.x, y: el.y, cssX: pos.x, cssY: pos.y });
      setEditingTextId(id);
      setSelectedTextId(null);
      setTool("text");
    },
    [texts, textPos, commitText, canvasToCss],
  );

  const handleDuplicateText = useCallback((id: number) => {
    setTexts((prev) => {
      const el = prev.find((t) => t.id === id);
      if (!el) return prev;
      const newId = nextTextIdRef.current++;
      return [...prev, { ...el, id: newId, x: el.x + 24, y: el.y + 24 }];
    });
    setSelectedTextId(null);
    markDirty();
  }, [markDirty]);

  const handleDeleteText = useCallback((id: number) => {
    setTexts((prev) => prev.filter((t) => t.id !== id));
    setSelectedTextId(null);
    markDirty();
  }, [markDirty]);

  const cancelStrokeForPinch = useCallback(() => {
    // A second finger landed mid-stroke: erase the accidental mark and hand over to the gesture.
    if (!drawingRef.current) return;
    const ctx = getCtx();
    const snapshot = undoStackRef.current.pop();
    if (ctx && snapshot) ctx.putImageData(snapshot, 0, 0);
    if (undoStackRef.current.length === 0) setCanUndo(false);
    drawingRef.current = false;
    lastPointRef.current = null;
    startPointRef.current = null;
    previewBaseRef.current = null;
    selectDragRef.current = null;
  }, [getCtx]);

  // Logical selection rect → container-relative CSS box (accounts for zoom/pan).
  const rectToCss = useCallback((r: Rect) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (!rect || !containerRect) return null;
    const sx = rect.width / CANVAS_W;
    const sy = rect.height / CANVAS_H;
    return {
      left: r.x * sx + (rect.left - containerRect.left),
      top: r.y * sy + (rect.top - containerRect.top),
      width: r.w * sx,
      height: r.h * sy,
    };
  }, []);

  // Copy the pixels under `r` onto a detached canvas (used to move/duplicate a selection).
  const copyRegion = useCallback((r: Rect) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const w = Math.max(1, Math.round(r.w));
    const h = Math.max(1, Math.round(r.h));
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    off.getContext("2d")!.drawImage(canvas, Math.round(r.x), Math.round(r.y), w, h, 0, 0, w, h);
    return off;
  }, []);

  const deleteSelection = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !selection) return;
    pushUndo(ctx);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
    setSelection(null);
    markDirty();
  }, [getCtx, selection, pushUndo, markDirty]);

  const duplicateSelection = useCallback(() => {
    const ctx = getCtx();
    if (!ctx || !selection) return;
    const bitmap = copyRegion(selection);
    if (!bitmap) return;
    pushUndo(ctx);
    const next = clampRect({ ...selection, x: selection.x + 24, y: selection.y + 24 });
    ctx.drawImage(bitmap, next.x, next.y);
    // The copy becomes the new selection, so it can be dragged straight off the original.
    setSelection(next);
    markDirty();
  }, [getCtx, selection, copyRegion, pushUndo, markDirty]);

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const ctx = getCtx();
      if (!ctx) return;
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        // Capture can fail for already-released pointers; drawing still works without it.
      }

      if (pointersRef.current.size === 2) {
        cancelStrokeForPinch();
        const [a, b] = [...pointersRef.current.values()];
        const rect = containerRef.current!.getBoundingClientRect();
        pinchRef.current = {
          dist0: Math.hypot(b.x - a.x, b.y - a.y),
          zoom0: zoomRef.current,
          mid0: { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top },
          pan0: panRef.current,
        };
        return;
      }
      if (pinchRef.current) return;

      // Space held → this drag pans the viewport instead of drawing.
      if (spacePanRef.current) {
        e.preventDefault();
        panDragRef.current = { start: { x: e.clientX, y: e.clientY }, pan0: panRef.current };
        return;
      }

      if (selectedTextId !== null) setSelectedTextId(null);

      const p = pointFromEvent(e);
      if (tool === "select") {
        // Suppress the native drag/text-selection default so the marquee tracks cleanly.
        e.preventDefault();
        if (textPos) commitText();
        const inside =
          selection && p.x >= selection.x && p.x <= selection.x + selection.w && p.y >= selection.y && p.y <= selection.y + selection.h;
        if (inside && selection) {
          // Lift the selected pixels off the canvas so they can be dragged around.
          const bitmap = copyRegion(selection);
          if (!bitmap) return;
          pushUndo(ctx);
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(selection.x, selection.y, selection.w, selection.h);
          selectDragRef.current = {
            mode: "move",
            start: p,
            rect0: selection,
            bitmap,
            base: ctx.getImageData(0, 0, CANVAS_W, CANVAS_H),
          };
          // Flagged as a stroke so a second finger (pinch) rolls the move back.
          drawingRef.current = true;
          markDirty();
        } else {
          setSelection(null);
          selectDragRef.current = { mode: "marquee", start: p };
          setMarquee({ x: p.x, y: p.y, w: 0, h: 0 });
        }
        return;
      }
      if (tool === "text") {
        // Suppress the mousedown default action — it would move focus to the
        // canvas (→ body) right after the effect focuses the floating input,
        // and that blur would instantly commit-and-close the empty text box.
        e.preventDefault();
        // Clicking with an open text box commits it, then places a new one.
        if (textPos) commitText();
        setTextPos(p);
        return;
      }
      pushUndo(ctx);
      drawingRef.current = true;
      startPointRef.current = p;
      lastPointRef.current = p;
      if (tool === "pen" || tool === "eraser") {
        // A tap with no movement still leaves a dot.
        ctx.beginPath();
        ctx.fillStyle = tool === "eraser" ? "#ffffff" : color;
        ctx.arc(p.x, p.y, (tool === "eraser" ? size * 2.5 : size) / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        // Shapes rubber-band over a snapshot of the canvas as it was on pointerdown.
        previewBaseRef.current = undoStackRef.current[undoStackRef.current.length - 1];
      }
      markDirty();
    },
    [getCtx, pointFromEvent, tool, color, size, textPos, commitText, pushUndo, cancelStrokeForPinch, selectedTextId, markDirty, selection, copyRegion],
  );

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }
      const pinch = pinchRef.current;
      if (pinch && pointersRef.current.size >= 2) {
        const [a, b] = [...pointersRef.current.values()];
        const rect = containerRef.current!.getBoundingClientRect();
        const dist = Math.hypot(b.x - a.x, b.y - a.y);
        const mid = { x: (a.x + b.x) / 2 - rect.left, y: (a.y + b.y) / 2 - rect.top };
        const z = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, pinch.zoom0 * (dist / Math.max(1, pinch.dist0))));
        // Anchor the content point that was under the initial midpoint, following the midpoint as it drifts (two-finger pan).
        const next = {
          x: mid.x - ((pinch.mid0.x - pinch.pan0.x) / pinch.zoom0) * z,
          y: mid.y - ((pinch.mid0.y - pinch.pan0.y) / pinch.zoom0) * z,
        };
        setZoom(z);
        setPan(clampPan(next, z));
        return;
      }
      const panDrag = panDragRef.current;
      if (panDrag) {
        setPan(
          clampPan(
            { x: panDrag.pan0.x + (e.clientX - panDrag.start.x), y: panDrag.pan0.y + (e.clientY - panDrag.start.y) },
            zoomRef.current,
          ),
        );
        return;
      }
      const drag = selectDragRef.current;
      if (drag) {
        const ctx = getCtx();
        if (!ctx) return;
        const p = pointFromEvent(e);
        if (drag.mode === "marquee") {
          setMarquee(clampRect(normRect(drag.start, p)));
        } else {
          const next = { ...drag.rect0, x: drag.rect0.x + (p.x - drag.start.x), y: drag.rect0.y + (p.y - drag.start.y) };
          ctx.putImageData(drag.base, 0, 0);
          ctx.drawImage(drag.bitmap, next.x, next.y);
          setSelection(next);
        }
        return;
      }
      if (!drawingRef.current) return;
      const ctx = getCtx();
      if (!ctx) return;
      const p = pointFromEvent(e);
      if (tool === "pen" || tool === "eraser") {
        const last = lastPointRef.current;
        if (!last) return;
        ctx.beginPath();
        ctx.strokeStyle = tool === "eraser" ? "#ffffff" : color;
        ctx.lineWidth = tool === "eraser" ? size * 2.5 : size;
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        ctx.moveTo(last.x, last.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        lastPointRef.current = p;
      } else {
        const start = startPointRef.current;
        const base = previewBaseRef.current;
        if (!start || !base) return;
        ctx.putImageData(base, 0, 0);
        drawShape(ctx, start, p);
      }
    },
    [getCtx, pointFromEvent, tool, color, size, drawShape, clampPan],
  );

  const handlePointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    pointersRef.current.delete(e.pointerId);
    if (pointersRef.current.size < 2) pinchRef.current = null;
    panDragRef.current = null;
    const drag = selectDragRef.current;
    if (drag) {
      selectDragRef.current = null;
      if (drag.mode === "marquee") {
        // A tap (or a sliver of a drag) just clears the selection.
        setSelection(marquee && marquee.w >= MIN_SELECTION && marquee.h >= MIN_SELECTION ? marquee : null);
        setMarquee(null);
      }
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    startPointRef.current = null;
    previewBaseRef.current = null;
  }, [marquee]);

  const handleUndo = useCallback(() => {
    const ctx = getCtx();
    const snapshot = undoStackRef.current.pop();
    if (!ctx || !snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    if (undoStackRef.current.length === 0) setCanUndo(false);
    setSelection(null);
    setMarquee(null);
    markDirty();
  }, [getCtx, markDirty]);

  const resetCanvas = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }
    paintBlank(ctx);
    undoStackRef.current = [];
    setCanUndo(false);
    setDirty(false);
    setTitle("");
    setEditingId(null);
    setTextPos(null);
    setTextValue("");
    setEditingTextId(null);
    setSelectedTextId(null);
    setTexts([]);
    setSelection(null);
    setMarquee(null);
    resetZoom();
  }, [getCtx, paintBlank, resetZoom]);

  // Figma/Miro-style shortcuts. Registered in the *capture* phase and stopping propagation
  // for keys we own, so the app-wide navigation hotkeys (t = Tasks, n = new task, c = chat,
  // bound on window in the layout) don't fire while sketching — here T has to mean "text tool".
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Never steal keys from the title field or the floating text input.
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      // An open dialog (cheat sheet, delete confirm) owns the keyboard — notably Escape,
      // which our capture-phase stopPropagation would otherwise swallow before Radix sees it.
      if (document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
      const take = () => {
        e.preventDefault();
        e.stopPropagation();
      };

      if (e.metaKey || e.ctrlKey) {
        const key = e.key.toLowerCase();
        if (key === "z" && !e.shiftKey) return take(), handleUndo();
        if (key === "d") {
          if (selection) return take(), duplicateSelection();
          if (selectedTextId !== null) return take(), handleDuplicateText(selectedTextId);
          return;
        }
        if (key === "=" || key === "+") return take(), zoomButtons(1.25);
        if (key === "-" || key === "_") return take(), zoomButtons(1 / 1.25);
        if (key === "0") return take(), resetZoom();
        return;
      }
      if (e.altKey) return;

      // Shift+0 / Shift+1 are Figma's "back to 100%" / "zoom to fit"; the canvas has a
      // fixed aspect ratio that fills the viewport at 100%, so both land on the same place.
      if (e.shiftKey) {
        if (e.key === "0" || e.key === ")" || e.key === "1" || e.key === "!") return take(), resetZoom();
        // Depending on layout/driver, shift+slash arrives as either "?" or "/".
        if (e.key === "?" || e.key === "/") return take(), setShortcutsOpen(true);
        return;
      }

      if (e.key === "?" || e.key === "/") return take(), setShortcutsOpen(true);

      if (e.key === "Escape") {
        take();
        setSelection(null);
        setSelectedTextId(null);
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (selection) return take(), deleteSelection();
        if (selectedTextId !== null) return take(), handleDeleteText(selectedTextId);
        return;
      }

      if (e.key === " ") {
        // Space still has to activate a focused button (a11y) rather than arming pan.
        if (t && t.closest("button")) return;
        // Hold space to pan (released in the keyup listener below). Repeat events fire
        // while held, so guard to keep this idempotent.
        if (!spacePanRef.current) {
          spacePanRef.current = true;
          setSpacePan(true);
        }
        take();
        return;
      }

      const nextTool = TOOL_BY_HOTKEY[e.key.toLowerCase()];
      if (nextTool) {
        take();
        setTool(nextTool);
        // Same as clicking the tool button: leaving Select drops the marquee.
        if (nextTool !== "select") setSelection(null);
        return;
      }

      // T is a tool key here, so the remaining app-wide letter hotkeys (n = new task,
      // c = chat) are swallowed too — otherwise a stray keystroke navigates away from a
      // half-finished sketch. Use the sidebar to leave the canvas.
      if (SUPPRESSED_GLOBAL_KEYS.has(e.key.toLowerCase())) take();
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") {
        spacePanRef.current = false;
        setSpacePan(false);
      }
    };
    // Releasing space outside the window (tab-away mid-pan) would otherwise leave it stuck on.
    const onBlur = () => {
      spacePanRef.current = false;
      setSpacePan(false);
    };

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", onBlur);
    };
  }, [
    selection,
    selectedTextId,
    deleteSelection,
    duplicateSelection,
    handleDeleteText,
    handleDuplicateText,
    handleUndo,
    zoomButtons,
    resetZoom,
  ]);

  // Ref mirrors so the debounced autosave always reads the latest state without re-arming on every keystroke.
  const editingIdRef = useRef<number | null>(null);
  const titleRef = useRef("");
  const textsRef = useRef(texts);
  editingIdRef.current = editingId;
  titleRef.current = title;
  textsRef.current = texts;

  const autoSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      let image_data: string;
      if (textsRef.current.length > 0) {
        const off = document.createElement("canvas");
        off.width = CANVAS_W;
        off.height = CANVAS_H;
        const octx = off.getContext("2d")!;
        octx.drawImage(canvas, 0, 0);
        for (const t of textsRef.current) {
          octx.fillStyle = t.color;
          octx.font = `${fontSizeFor(t.size)}px sans-serif`;
          octx.textBaseline = "middle";
          octx.fillText(t.value, t.x, t.y);
        }
        image_data = off.toDataURL("image/png");
      } else {
        image_data = canvas.toDataURL("image/png");
      }
      const saveTitle = titleRef.current.trim() || "Untitled";
      const currentEditingId = editingIdRef.current;
      const res = currentEditingId
        ? await fetch(`/api/sketches/${currentEditingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: saveTitle, image_data }),
          })
        : await fetch("/api/sketches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: saveTitle, image_data }),
          });
      if (!res.ok) throw new Error();
      const saved: Sketch = await res.json();
      if (!currentEditingId) setEditingId(saved.id);
      setDirty(false);
      setSketches((prev) => {
        const others = prev.filter((s) => s.id !== saved.id);
        return [saved, ...others].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at));
      });
    } catch {
      toast.error("Failed to save sketch");
    } finally {
      setSaving(false);
    }
  }, []);

  // Debounced autosave: fires ~1.5s after the last edit (stroke, shape, text change, or undo).
  // Keyed on editVersion (not dirty/texts) so the timer resets on every edit, even consecutive ones.
  useEffect(() => {
    if (editVersion === 0) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      autoSaveTimerRef.current = null;
      autoSave();
    }, 1500);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [editVersion, autoSave]);

  const handleEdit = useCallback(
    (sketch: Sketch) => {
      const ctx = getCtx();
      if (!ctx) return;
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
      const img = new Image();
      img.onload = () => {
        paintBlank(ctx);
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        undoStackRef.current = [];
        setCanUndo(false);
        setDirty(false);
        setTitle(sketch.title);
        setEditingId(sketch.id);
        setTextPos(null);
        setTextValue("");
        setEditingTextId(null);
        setSelectedTextId(null);
        setTexts([]);
        setSelection(null);
        setMarquee(null);
        resetZoom();
        containerRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      };
      img.src = sketch.image_data;
    },
    [getCtx, paintBlank, resetZoom],
  );

  const handleDelete = useCallback(
    async (id: number) => {
      const res = await fetch(`/api/sketches/${id}`, { method: "DELETE" });
      if (res.ok) {
        setSketches((prev) => prev.filter((s) => s.id !== id));
        if (editingId === id) setEditingId(null);
        toast.success("Sketch deleted");
      } else {
        toast.error("Failed to delete sketch");
      }
    },
    [editingId],
  );

  const handleDownload = useCallback((sketch: Sketch) => {
    const a = document.createElement("a");
    a.href = sketch.image_data;
    a.download = `${sketch.title.replace(/[^a-z0-9-_ ]/gi, "") || "sketch"}.png`;
    a.click();
  }, []);

  // Scale the floating text input's font to roughly match the committed text size.
  const fontScale = (() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    return rect ? rect.width / CANVAS_W : 1;
  })();
  const cssFontSize = Math.max(12, fontSizeFor(size) * fontScale);

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Title + autosave status */}
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value);
            if (editingId !== null) markDirty();
          }}
          placeholder="Sketch title…"
          className="h-9 max-w-xs font-medium"
        />
        <span className="text-xs text-muted-foreground min-w-16">
          {saving ? (
            <span className="flex items-center gap-1.5">
              <Spinner className="size-3" />
              Saving…
            </span>
          ) : dirty ? (
            "Unsaved"
          ) : editingId ? (
            "Saved"
          ) : null}
        </span>
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ key, label, icon: Icon, hotkey }) => (
            <Button
              key={key}
              variant={tool === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => {
                setTool(key);
                if (key !== "select") setSelection(null);
              }}
              aria-label={`${label} (${hotkey.toUpperCase()})`}
              title={`${label} (${hotkey.toUpperCase()})`}
            >
              <Icon className="size-3.5" />
            </Button>
          ))}
        </div>
        <div className="flex items-center gap-1 ml-1">
          {COLORS.map((c) => (
            <button
              key={c}
              onClick={() => {
                setColor(c);
                if (tool === "eraser") setTool("pen");
              }}
              aria-label={`Pen color ${c}`}
              className={cn(
                "size-6 rounded-full border border-border transition-transform",
                color === c && tool !== "eraser" ? "ring-2 ring-primary ring-offset-2 ring-offset-background scale-110" : "hover:scale-110",
              )}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-1.5 ml-1" title="Line weight">
          <input
            type="range"
            min={MIN_SIZE}
            max={MAX_SIZE}
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
            aria-label="Line weight"
            className="w-24 accent-primary"
          />
          <span className="text-xs text-muted-foreground tabular-nums w-8">{size}px</span>
        </div>
        <div className="flex items-center gap-0.5">
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomButtons(1 / 1.25)} disabled={zoom <= MIN_ZOOM} aria-label="Zoom out">
            <ZoomOutIcon className="size-3.5" />
          </Button>
          <Button variant="ghost" size="sm" className="h-7 px-1.5 text-xs tabular-nums" onClick={resetZoom} disabled={zoom === 1} aria-label="Reset zoom" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </Button>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => zoomButtons(1.25)} disabled={zoom >= MAX_ZOOM} aria-label="Zoom in">
            <ZoomInIcon className="size-3.5" />
          </Button>
        </div>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={handleUndo} disabled={!canUndo} title="Undo (⌘Z)">
          <Undo2Icon className="size-3.5" />
          Undo
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={resetCanvas} disabled={!dirty && !editingId}>
          <XIcon className="size-3.5" />
          {editingId ? "New sketch" : "Clear"}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setShortcutsOpen(true)}
          aria-label="Keyboard shortcuts"
          title="Keyboard shortcuts (?)"
        >
          <KeyboardIcon className="size-3.5" />
        </Button>
      </div>

      {/* Canvas viewport — zoom/pan applies a CSS transform to the canvas inside.
          The viewport is muted, not white, so the "paper" still reads as a page when zoomed out past 100%. */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-border bg-muted touch-none select-none"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn(
            "absolute left-0 top-0 w-full",
            spacePan
              ? "cursor-grab active:cursor-grabbing"
              : tool === "text"
                ? "cursor-text"
                : tool === "select"
                  ? "cursor-default"
                  : "cursor-crosshair",
          )}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        />
        {/* Selection marquee — dashed outline plus a duplicate/delete toolbar once the drag settles. */}
        {tool === "select" && (marquee ?? selection)
          ? (() => {
              const rect = marquee ?? selection!;
              const box = rectToCss(rect);
              if (!box) return null;
              const settled = !marquee && !!selection;
              return (
                <div className="absolute pointer-events-none" style={{ left: box.left, top: box.top, width: box.width, height: box.height }}>
                  <div className="absolute inset-0 rounded-[2px] border border-dashed border-primary/70 bg-primary/5" />
                  {settled ? (
                    <div
                      className="absolute left-0 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover p-0.5 shadow-sm pointer-events-auto"
                      // Flip below the box when there's no room above it.
                      style={box.top < 36 ? { top: box.height + 4 } : { top: -32 }}
                    >
                      <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={duplicateSelection} aria-label="Duplicate selection">
                        <CopyIcon className="size-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={deleteSelection}
                        aria-label="Delete selection"
                      >
                        <TrashIcon className="size-3" />
                      </Button>
                    </div>
                  ) : null}
                </div>
              );
            })()
          : null}
        {texts.map((t) => {
          if (editingTextId === t.id) return null;
          const pos = canvasToCss(t.x, t.y);
          const selected = selectedTextId === t.id;
          return (
            <div key={t.id} className="absolute" style={{ left: pos.x, top: pos.y, transform: "translateY(-50%)" }}>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedTextId(selected ? null : t.id);
                }}
                className={cn(
                  "block whitespace-nowrap bg-transparent text-left p-0 leading-none",
                  selected && "outline outline-1 outline-dashed outline-primary/60 outline-offset-2",
                )}
                style={{ color: t.color, fontSize: fontSizeFor(t.size) * fontScale, fontFamily: "sans-serif" }}
              >
                {t.value}
              </button>
              {selected ? (
                <div
                  className="absolute left-0 -top-8 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover shadow-sm p-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleEditText(t.id)} aria-label="Edit text">
                    <PencilIcon className="size-3" />
                  </Button>
                  <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => handleDuplicateText(t.id)} aria-label="Duplicate text">
                    <CopyIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                    onClick={() => handleDeleteText(t.id)}
                    aria-label="Delete text"
                  >
                    <TrashIcon className="size-3" />
                  </Button>
                </div>
              ) : null}
            </div>
          );
        })}
        {textPos ? (
          <input
            ref={textInputRef}
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onBlur={commitText}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitText();
              if (e.key === "Escape") {
                setTextPos(null);
                setTextValue("");
                setEditingTextId(null);
              }
            }}
            placeholder="Type…"
            className="absolute bg-transparent outline-none border-b border-dashed border-muted-foreground/50 min-w-24 max-w-[60%] p-0"
            style={{
              left: textPos.cssX,
              top: textPos.cssY,
              transform: "translateY(-50%)",
              color,
              fontSize: cssFontSize,
              fontFamily: "sans-serif",
            }}
          />
        ) : null}
      </div>

      {/* Gallery */}
      <div className="mt-2">
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Saved sketches</h3>
        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="aspect-[4/3] rounded-xl" />
            ))}
          </div>
        ) : sketches.length === 0 ? (
          <Empty className="border border-dashed border-border rounded-xl py-8">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BrushIcon />
              </EmptyMedia>
              <EmptyTitle>No sketches yet</EmptyTitle>
              <EmptyDescription>Draw something above and hit Save.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {sketches.map((sketch) => (
              <Card key={sketch.id} className="group overflow-hidden p-0 gap-0">
                <button onClick={() => handleEdit(sketch)} className="block w-full" aria-label={`Edit ${sketch.title}`}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={sketch.image_data} alt={sketch.title} className="aspect-[4/3] w-full object-cover bg-white" />
                </button>
                <div className="flex items-center justify-between gap-1 px-2.5 py-1.5 border-t border-border">
                  <div className="min-w-0">
                    <p className="text-xs font-medium truncate">{sketch.title}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(sketch.updated_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleDownload(sketch)} aria-label="Download PNG">
                      <DownloadIcon className="size-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" aria-label="Delete sketch">
                          <TrashIcon className="size-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete “{sketch.title}”?</AlertDialogTitle>
                          <AlertDialogDescription>This permanently deletes the sketch.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(sketch.id)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={shortcutsOpen} onOpenChange={setShortcutsOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Keyboard shortcuts</DialogTitle>
            <DialogDescription>Tool keys work whenever you&apos;re not typing in a text field.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-5 sm:grid-cols-2">
            {SHORTCUT_GROUPS.map((group) => (
              <div key={group.title} className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{group.title}</p>
                <ul className="space-y-1.5">
                  {group.items.map(([keys, label]) => (
                    <li key={label} className="flex items-center justify-between gap-3 text-sm">
                      <span className="text-muted-foreground">{label}</span>
                      <kbd className="shrink-0 rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-xs">{keys}</kbd>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

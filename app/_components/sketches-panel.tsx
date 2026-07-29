"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowUpRightIcon,
  BrushIcon,
  CircleIcon,
  DownloadIcon,
  EraserIcon,
  MinusIcon,
  PenLineIcon,
  PlusIcon,
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
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;

const COLORS = ["#1a1a1a", "#dc2626", "#2563eb", "#16a34a", "#ea580c", "#9333ea"];

type Tool = "pen" | "eraser" | "rect" | "ellipse" | "line" | "arrow" | "text";

const TOOLS: { key: Tool; label: string; icon: typeof BrushIcon }[] = [
  { key: "pen", label: "Pen", icon: PenLineIcon },
  { key: "eraser", label: "Eraser", icon: EraserIcon },
  { key: "rect", label: "Rectangle", icon: SquareIcon },
  { key: "ellipse", label: "Ellipse", icon: CircleIcon },
  { key: "line", label: "Line", icon: MinusIcon },
  { key: "arrow", label: "Arrow", icon: ArrowUpRightIcon },
  { key: "text", label: "Text", icon: TypeIcon },
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

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });

  // Pending text placement: logical canvas coords + container-relative CSS position.
  const [textPos, setTextPos] = useState<{ x: number; y: number; cssX: number; cssY: number } | null>(null);
  const [textValue, setTextValue] = useState("");
  const textInputRef = useRef<HTMLInputElement>(null);

  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);
  const previewBaseRef = useRef<ImageData | null>(null);
  const undoStackRef = useRef<ImageData[]>([]);

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
    return {
      x: Math.min(0, Math.max(w - w * z, p.x)),
      y: Math.min(0, Math.max(h - h * z, p.y)),
    };
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
        applyZoom(zoomRef.current * Math.exp(-e.deltaY * 0.01), cursor);
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
    const ctx = getCtx();
    if (!ctx || !textPos) return;
    const value = textValue.trim();
    if (value) {
      pushUndo(ctx);
      ctx.fillStyle = color;
      ctx.font = `${fontSizeFor(size)}px sans-serif`;
      ctx.textBaseline = "middle";
      ctx.fillText(value, textPos.x, textPos.y);
      setDirty(true);
    }
    setTextPos(null);
    setTextValue("");
  }, [getCtx, textPos, textValue, color, size, pushUndo]);

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
  }, [getCtx]);

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

      const p = pointFromEvent(e);
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
      setDirty(true);
    },
    [getCtx, pointFromEvent, tool, color, size, textPos, commitText, pushUndo, cancelStrokeForPinch],
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
    drawingRef.current = false;
    lastPointRef.current = null;
    startPointRef.current = null;
    previewBaseRef.current = null;
  }, []);

  const handleUndo = useCallback(() => {
    const ctx = getCtx();
    const snapshot = undoStackRef.current.pop();
    if (!ctx || !snapshot) return;
    ctx.putImageData(snapshot, 0, 0);
    if (undoStackRef.current.length === 0) setCanUndo(false);
  }, [getCtx]);

  const resetCanvas = useCallback(() => {
    const ctx = getCtx();
    if (!ctx) return;
    paintBlank(ctx);
    undoStackRef.current = [];
    setCanUndo(false);
    setDirty(false);
    setTitle("");
    setEditingId(null);
    setTextPos(null);
    setTextValue("");
    resetZoom();
  }, [getCtx, paintBlank, resetZoom]);

  const handleSave = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas || !dirty) return;
    setSaving(true);
    try {
      const image_data = canvas.toDataURL("image/png");
      const res = editingId
        ? await fetch(`/api/sketches/${editingId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, image_data }),
          })
        : await fetch("/api/sketches", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title, image_data }),
          });
      if (!res.ok) throw new Error();
      toast.success(editingId ? "Sketch updated" : "Sketch saved");
      resetCanvas();
      loadSketches();
    } catch {
      toast.error("Failed to save sketch");
    } finally {
      setSaving(false);
    }
  }, [dirty, editingId, title, resetCanvas, loadSketches]);

  const handleEdit = useCallback(
    (sketch: Sketch) => {
      const ctx = getCtx();
      if (!ctx) return;
      const img = new Image();
      img.onload = () => {
        paintBlank(ctx);
        ctx.drawImage(img, 0, 0, CANVAS_W, CANVAS_H);
        undoStackRef.current = [];
        setCanUndo(false);
        setDirty(false);
        setTitle(sketch.title);
        setEditingId(sketch.id);
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
  const cssFontSize = (() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const scale = rect ? rect.width / CANVAS_W : 1;
    return Math.max(12, fontSizeFor(size) * scale);
  })();

  return (
    <div className="flex flex-col gap-4 p-4 overflow-y-auto">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {TOOLS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant={tool === key ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setTool(key)}
              aria-label={label}
              title={label}
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
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={handleUndo} disabled={!canUndo}>
          <Undo2Icon className="size-3.5" />
          Undo
        </Button>
        <Button variant="ghost" size="sm" className="h-7 gap-1.5 px-2" onClick={resetCanvas} disabled={!dirty && !editingId}>
          <XIcon className="size-3.5" />
          {editingId ? "New sketch" : "Clear"}
        </Button>
      </div>

      {/* Canvas viewport — zoom/pan applies a CSS transform to the canvas inside */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[4/3] overflow-hidden rounded-xl border border-border bg-white touch-none select-none"
      >
        <canvas
          ref={canvasRef}
          width={CANVAS_W}
          height={CANVAS_H}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={cn("absolute left-0 top-0 w-full", tool === "text" ? "cursor-text" : "cursor-crosshair")}
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: "0 0" }}
        />
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

      {/* Save row */}
      <div className="flex items-center gap-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Sketch title…"
          className="h-9 max-w-xs"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
        />
        <Button size="sm" onClick={handleSave} disabled={!dirty || saving} className="gap-1.5">
          {saving ? <Spinner className="size-3.5" /> : <PlusIcon className="size-3.5" />}
          {editingId ? "Update" : "Save"}
        </Button>
        {editingId ? (
          <span className="text-xs text-muted-foreground">Editing “{sketches.find((s) => s.id === editingId)?.title ?? "sketch"}”</span>
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
    </div>
  );
}

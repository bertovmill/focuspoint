"use client";

import { type CSSProperties, useCallback, useEffect, useRef, useState } from "react";

// The corner chat window's size on desktop. It's anchored bottom-right, so it
// grows up and to the left: the handles sit on its top edge, left edge and
// top-left corner. The size sticks per browser.
const STORAGE_KEY = "cael:corner-chat-size";
const DEFAULT = { w: 400, h: 640 };
const MIN = { w: 320, h: 380 };
// Room left around the window: the right/bottom offset plus a margin at the far edges.
const MARGIN = 40;

type Size = { w: number; h: number };

function clamp(size: Size): Size {
  const maxW = Math.max(MIN.w, window.innerWidth - MARGIN);
  const maxH = Math.max(MIN.h, window.innerHeight - MARGIN);
  return {
    w: Math.round(Math.min(maxW, Math.max(MIN.w, size.w))),
    h: Math.round(Math.min(maxH, Math.max(MIN.h, size.h))),
  };
}

export function useCornerSize() {
  const [size, setSize] = useState<Size>(DEFAULT);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Size | null;
      if (saved && Number.isFinite(saved.w) && Number.isFinite(saved.h)) setSize(clamp(saved));
    } catch {}
  }, []);

  const save = useCallback((next: Size) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  }, []);

  // Read through CSS variables so the phone's full-screen classes still win below lg.
  const style = { "--corner-w": `${size.w}px`, "--corner-h": `${size.h}px` } as CSSProperties;
  return { size, setSize, save, style };
}

type Edge = "top" | "left" | "corner";

export function CornerResizeHandles({
  size,
  setSize,
  save,
}: {
  size: Size;
  setSize: (size: Size) => void;
  save: (size: Size) => void;
}) {
  const drag = useRef<{ edge: Edge; x: number; y: number; start: Size; last: Size } | null>(null);

  const onPointerDown = (edge: Edge) => (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    drag.current = { edge, x: e.clientX, y: e.clientY, start: size, last: size };
    document.body.style.userSelect = "none";
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clamp({
      w: d.edge === "top" ? d.start.w : d.start.w + (d.x - e.clientX),
      h: d.edge === "left" ? d.start.h : d.start.h + (d.y - e.clientY),
    });
    d.last = next;
    setSize(next);
  };
  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    document.body.style.userSelect = "";
    e.currentTarget.releasePointerCapture(e.pointerId);
    save(d.last);
  };
  // Double-click any handle: back to the default size.
  const reset = () => {
    const next = clamp(DEFAULT);
    setSize(next);
    save(next);
  };

  const common = { onPointerMove, onPointerUp, onPointerCancel: onPointerUp, onDoubleClick: reset };
  return (
    <>
      <div
        {...common}
        onPointerDown={onPointerDown("top")}
        className="absolute inset-x-5 top-0 z-20 hidden h-1.5 cursor-ns-resize lg:block"
        aria-hidden
      />
      <div
        {...common}
        onPointerDown={onPointerDown("left")}
        className="absolute inset-y-5 left-0 z-20 hidden w-1.5 cursor-ew-resize lg:block"
        aria-hidden
      />
      <div
        {...common}
        onPointerDown={onPointerDown("corner")}
        className="group absolute left-0 top-0 z-30 hidden size-5 cursor-nwse-resize lg:block"
        title="Drag to resize · double-click to reset"
      >
        <span className="absolute left-1 top-1 size-2 rounded-tl-md border-l-2 border-t-2 border-muted-foreground/30 transition-colors group-hover:border-muted-foreground/70" />
      </div>
    </>
  );
}

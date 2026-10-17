"use client";

import { useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { WINDOW_GRID, type WindowRect } from "./scene";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/** How far down the glass the shade starts, and the range you can pull it through (fractions of the glass's height). */
const REST = 0.3;
const MIN = 0.03;
const MAX = 1;

/**
 * A roller shade hanging inside the window: a linen sheet on a slim roller
 * tube at the top of the glass, with a dark bar along its hem and a small
 * pull tab beneath. Drag the bar or the tab up and down; it stays where you
 * leave it.
 *
 * It is a layer of the page, not part of the shader, so it sits identically
 * on the WebGPU wall and the CSS fallback. It uses the same glass rectangle
 * and the same black mullions as the wall, and is drawn under the plant and
 * the jar so they still stand in front of it.
 */
export function WindowBlind({
  rect,
  width,
  height,
  style,
}: {
  rect: WindowRect;
  /** The layer's size in pixels. */
  width: number;
  height: number;
  /** Carries the desk's `--desk-light` / `--desk-tone` so the linen dims after dark. */
  style?: CSSProperties;
}) {
  const [lower, setLower] = useState(REST);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; from: number } | null>(null);

  const glassW = rect.hw * 2 * width;
  const glassH = rect.hh * 2 * height;
  // The wall's frame scale: a phone's small window gets slimmer fittings.
  const joinery = clamp(rect.hh / 0.24, 0.5, 1);
  const tubeH = Math.round(11 * joinery);
  const barH = Math.max(4, Math.round(7 * joinery));
  const mullionW = Math.max(2, 2 * 0.003 * joinery * height);
  const hemY = lower * glassH;

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Synthetic or already-released pointers: the drag still works while the pointer stays over it.
    }
    drag.current = { y: e.clientY, from: lower };
    setDragging(true);
  };
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    setLower(clamp(d.from + (e.clientY - d.y) / glassH, MIN, MAX));
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const grab = {
    onPointerDown: onDown,
    onPointerMove: onMove,
    onPointerUp: onUp,
    onPointerCancel: onUp,
  };

  return (
    <div
      className="absolute [--desk-dim:1] dark:[--desk-dim:0.72]"
      style={{
        left: (rect.x - rect.hw) * width,
        top: (rect.y - rect.hh) * height,
        width: glassW,
        height: glassH,
        ...style,
      }}
    >
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ filter: "brightness(calc(var(--desk-light) * var(--desk-dim))) saturate(var(--desk-tone))" }}
      >
        {/* The linen, with a faint weave and a shadow under the roller. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: hemY,
            backgroundColor: "#e8e2d4",
            backgroundImage:
              "linear-gradient(to bottom, rgba(40,32,20,0.22), rgba(40,32,20,0) 7%), repeating-linear-gradient(90deg, rgba(60,48,30,0.03) 0 1px, rgba(255,255,255,0) 1px 3px), linear-gradient(to bottom, rgba(255,255,255,0), rgba(255,255,255,0.12))",
          }}
        />
        {/* The hem bar, with the shade's shadow on the view beneath it. */}
        <div
          className="absolute inset-x-0"
          style={{
            top: Math.max(hemY - barH, 0),
            height: barH,
            backgroundColor: "#2a2724",
            boxShadow: "0 3px 6px rgba(20,16,10,0.35)",
          }}
        />
        {/* The roller tube. */}
        <div
          className="absolute inset-x-0 top-0"
          style={{
            height: tubeH,
            backgroundImage: "linear-gradient(to bottom, #bdb6a6, #f2ede1 38%, #aaa396)",
            boxShadow: "0 2px 5px rgba(20,16,10,0.3)",
          }}
        />
        {/* The steel mullions stand in front of the shade, as they do on the glass. */}
        {Array.from({ length: WINDOW_GRID.cols - 1 }, (_, i) => (
          <div
            key={`mullion-${i}`}
            className="absolute inset-y-0 -translate-x-1/2 bg-[#161617]"
            style={{ left: `${((i + 1) / WINDOW_GRID.cols) * 100}%`, width: mullionW }}
          />
        ))}
        {/* A generous grab strip along the hem. */}
        <div
          className={`absolute inset-x-0 touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"} pointer-events-auto`}
          style={{ top: Math.max(hemY - barH - 8, 0), height: barH + 16 }}
          {...grab}
        />
      </div>

      {/* The pull tab, hanging from the hem. */}
      <div
        className={`pointer-events-auto absolute touch-none ${dragging ? "cursor-grabbing" : "cursor-grab"}`}
        style={{
          left: "30%",
          top: hemY,
          width: 22,
          height: 44,
          transform: "translateX(-50%)",
          filter: "brightness(calc(var(--desk-light) * var(--desk-dim)))",
        }}
        {...grab}
      >
        <div className="mx-auto h-[10px] w-[2px] bg-[#8f877a]" />
        <div
          className="mx-auto h-[20px] w-[12px] rounded-full"
          style={{
            backgroundImage: "linear-gradient(to right, #b9b1a2, #efe9dc 45%, #a39b8d)",
            boxShadow: "2px 4px 5px rgba(35,28,20,0.3)",
          }}
        />
      </div>
    </div>
  );
}

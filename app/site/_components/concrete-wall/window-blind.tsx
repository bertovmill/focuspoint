"use client";

import { useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { blindStore } from "./blind-store";
import type { WindowRect } from "./scene";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The roller shade's handles, and its picture when there is no GPU wall.
 *
 * With WebGPU the wall's shader draws the shade itself (translucent linen in
 * front of the glass and the mullion, in `wall.wgsl`) and this layer is just
 * the invisible strip along the hem and the pull tab to grab. Without it, the
 * same shade is drawn here with CSS: a translucent, softly blurred panel over
 * the framed picture. Either way `blindStore` holds where the hem hangs; drag
 * the hem or the tab and it stays where you leave it.
 *
 * It is drawn under the plant and the jar so they still stand in front of it.
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
  const lower = useSyncExternalStore(blindStore.subscribe, blindStore.getLower, blindStore.getLower);
  const shaderDraws = useSyncExternalStore(blindStore.subscribe, blindStore.getShaderDraws, () => false);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ y: number; from: number } | null>(null);

  const glassH = rect.hh * 2 * height;
  const hemY = lower * glassH;
  const cursor = dragging ? "cursor-grabbing" : "cursor-grab";

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
    blindStore.setLower(clamp(d.from + (e.clientY - d.y) / glassH, 0, 1));
  };
  const onUp = () => {
    drag.current = null;
    setDragging(false);
  };
  const grab = { onPointerDown: onDown, onPointerMove: onMove, onPointerUp: onUp, onPointerCancel: onUp };

  // The linen, as an rgb() that the desk's light dims after dark.
  const linen = (alpha: number) =>
    `rgb(calc(238 * var(--desk-light) * var(--desk-dim)) calc(232 * var(--desk-light) * var(--desk-dim)) calc(218 * var(--desk-light) * var(--desk-dim)) / ${alpha})`;

  return (
    <div
      className="absolute [--desk-dim:1] dark:[--desk-dim:0.72]"
      style={{
        left: (rect.x - rect.hw) * width,
        top: (rect.y - rect.hh) * height,
        width: rect.hw * 2 * width,
        height: glassH,
        ...style,
      }}
    >
      {/* The CSS stand-in: a translucent panel that softens whatever is behind it. */}
      {!shaderDraws && hemY > 1 && (
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-x-0 top-0"
            style={{
              height: hemY,
              backgroundColor: linen(0.62),
              backgroundImage:
                "linear-gradient(to bottom, rgba(40,32,20,0.16), rgba(40,32,20,0) 7%), repeating-linear-gradient(90deg, rgba(60,48,30,0.03) 0 1px, rgba(255,255,255,0) 1px 3px)",
              backdropFilter: "blur(7px)",
              WebkitBackdropFilter: "blur(7px)",
              borderBottom: "1px solid rgba(90,78,56,0.16)",
              boxShadow: "0 6px 10px -4px rgba(20,16,10,0.22)",
            }}
          />
        </div>
      )}

      {/* The strip along the hem you can grab. */}
      <div
        className={`pointer-events-auto absolute inset-x-0 touch-none ${cursor}`}
        style={{ top: Math.max(hemY - 10, 0), height: 20 }}
        {...grab}
      />

      {/* The pull tab, hanging from the hem. */}
      <div
        className={`pointer-events-auto absolute touch-none ${cursor}`}
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
        <div className="mx-auto h-[10px] w-[2px] bg-[#b3ab9c]" />
        <div
          className="mx-auto h-[20px] w-[12px] rounded-full"
          style={{
            backgroundImage: "linear-gradient(to right, #c9c1b2, #f3eee2 45%, #b5ad9d)",
            boxShadow: "2px 4px 5px rgba(35,28,20,0.3)",
          }}
        />
      </div>
    </div>
  );
}

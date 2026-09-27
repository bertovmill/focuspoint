"use client";

import { useEffect, useRef, useState } from "react";
import { PaperTexture } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";
import { createWallRenderer } from "./renderer";
import { ChalkBlueprint } from "./chalk-blueprint";
import { EtchedSketches } from "./etched-sketches";

/**
 * A lit concrete wall behind the hero, after the backdrop on vgpu.sh.
 *
 * Two versions of the same wall, and the page shows whichever it can:
 *
 * - WebGPU (`wall.wgsl`): a procedural plaster height field lit by a soft
 *   light that drifts across it and leans toward the pointer. This is the
 *   one you're meant to see.
 * - CSS: a warm base, a one-frame paper shader for the mottle, and blurred
 *   gradients for the window light. Always rendered underneath, so browsers
 *   without WebGPU (Firefox, most in-app browsers) get the same picture, and
 *   the canvas fades in over it once its first frame is ready.
 *
 * Full-bleed: the hero lives inside the page's `px-6` column, so this escapes
 * it with the `w-screen` centring trick rather than moving the hero out.
 */
/**
 * Paints a heading's lines into a mask the size of the wall's drawing buffer:
 * red is the sharp letters, green the same letters blurred, which the shader
 * reads as the glass's bevel height. Positions come from the laid-out line
 * boxes, so the glass lands exactly where the browser put the text.
 */
function paintGlassMask(
  root: HTMLElement,
  heading: HTMLElement,
  width: number,
  height: number,
): HTMLCanvasElement | null {
  const rootBox = root.getBoundingClientRect();
  if (rootBox.width < 1 || width < 1 || height < 1) return null;
  const scale = width / rootBox.width;
  const style = getComputedStyle(heading);
  const fontSize = parseFloat(style.fontSize);
  const font = `${style.fontStyle} ${style.fontWeight} ${fontSize}px ${style.fontFamily}`;

  const drawLines = (ctx: CanvasRenderingContext2D, color: string, k: number) => {
    ctx.setTransform(scale * k, 0, 0, scale * k, 0, 0);
    ctx.fillStyle = color;
    ctx.font = font;
    if ("letterSpacing" in ctx) ctx.letterSpacing = style.letterSpacing;
    ctx.textBaseline = "alphabetic";
    // CSS centres the font's content area in the line box; match its baseline.
    const m = ctx.measureText("Hg");
    const ascent = m.fontBoundingBoxAscent;
    const descent = m.fontBoundingBoxDescent;
    for (const line of heading.querySelectorAll<HTMLElement>("[data-line]")) {
      const r = line.getBoundingClientRect();
      const baseline = r.top - rootBox.top + (r.height - (ascent + descent)) / 2 + ascent;
      ctx.fillText(line.textContent ?? "", r.left - rootBox.left, baseline);
    }
  };

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) return null;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  drawLines(ctx, "#f00", 1);

  // The blur: paint the letters small and scale them back up, twice, which
  // softens them by roughly a tenth of the font size in every browser (no
  // reliance on ctx.filter).
  const k = Math.min(1, 1 / Math.max(1, fontSize * scale * 0.06));
  const small = document.createElement("canvas");
  small.width = Math.max(1, Math.round(width * k));
  small.height = Math.max(1, Math.round(height * k));
  const sctx = small.getContext("2d");
  if (!sctx) return null;
  drawLines(sctx, "#0f0", k);
  const mid = document.createElement("canvas");
  mid.width = Math.max(1, Math.round(width * k * 2));
  mid.height = Math.max(1, Math.round(height * k * 2));
  const mctx = mid.getContext("2d");
  if (!mctx) return null;
  mctx.imageSmoothingQuality = "high";
  mctx.drawImage(small, 0, 0, mid.width, mid.height);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "lighter";
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(mid, 0, 0, width, height);
  ctx.globalCompositeOperation = "source-over";
  return out;
}

export function ConcreteWall({
  className,
  glassHeadingId,
}: {
  className?: string;
  /** Id of a heading to render as clear glass inside the wall. */
  glassHeadingId?: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(false);
  const [live, setLive] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "gpu" in navigator);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    if (!supported || !root || !canvas) return;

    // Pointer in wall uv space (y down, matching the shader), null when away.
    let pointer: [number, number] | null = null;
    const onMove = (e: PointerEvent) => {
      const r = root.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top) / r.height;
      pointer = x >= 0 && x <= 1 && y >= 0 && y <= 1 ? [x, y] : null;
    };
    const onLeave = () => {
      pointer = null;
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerleave", onLeave);
    document.addEventListener("pointercancel", onLeave);

    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const html = document.documentElement;

    const heading = glassHeadingId ? document.getElementById(glassHeadingId) : null;
    let bakeTimer: ReturnType<typeof setTimeout> | undefined;
    const settleTimers: ReturnType<typeof setTimeout>[] = [];
    // No bake until fonts are in and the hero's entrance has finished.
    let settled = false;
    const bake = () => {
      bakeTimer = undefined;
      if (!heading || !settled) return;
      const [w, h] = renderer.size();
      const mask = paintGlassMask(root, heading, w, h);
      if (!mask) return;
      try {
        if (renderer.setGlassMask(mask)) heading.classList.add("glass-live");
      } catch (error) {
        console.warn("Glass headline could not render", error);
      }
    };
    const requestBake = () => {
      if (bakeTimer === undefined) bakeTimer = setTimeout(bake, 0);
    };

    const renderer = createWallRenderer(canvas, {
      isDark: () => html.classList.contains("dark"),
      pointer: () => pointer,
      reducedMotion: () => motion.matches,
      onResize: requestBake,
    });
    const observer = new ResizeObserver(requestBake);
    if (heading) observer.observe(heading);
    renderer.ready
      .then(() => {
        setLive(true);
        // A raster in a fallback font would be the wrong shapes, and one taken
        // mid-entrance (the hero scales and slides in) lands in the wrong place.
        // Bake once fonts are in, then again once every running animation on
        // the page has settled.
        const markSettled = () => {
          settled = true;
          requestBake();
        };
        const settle = () => {
          const running = document.getAnimations().filter((a) => a.playState === "running");
          void Promise.allSettled([document.fonts.ready, ...running.map((a) => a.finished)]).then(markSettled);
        };
        // Past this, bake regardless (an endless animation elsewhere shouldn't block it).
        settleTimers.push(setTimeout(settle, 50), setTimeout(markSettled, 3000));
      })
      // A wall that can't start is not an error the page should surface: the
      // CSS one is already there.
      .catch((error: unknown) => {
        console.warn("Concrete wall could not start", error);
        setSupported(false);
      });

    return () => {
      if (bakeTimer !== undefined) clearTimeout(bakeTimer);
      settleTimers.forEach(clearTimeout);
      observer.disconnect();
      heading?.classList.remove("glass-live");
      renderer.dispose();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointercancel", onLeave);
    };
  }, [supported, glassHeadingId]);

  return (
    <div
      ref={rootRef}
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden",
        className,
      )}
    >
      {/* CSS wall, always present. */}
      <div className="absolute inset-0 bg-[#d9d5ce] dark:bg-[#2b2a28]" />
      <div className="absolute inset-0 opacity-90 mix-blend-multiply dark:opacity-40 dark:mix-blend-screen">
        <PaperTexture
          style={{ width: "100%", height: "100%" }}
          colorFront="#9d988f"
          colorBack="#f1eee8"
          scale={0.4}
          contrast={0.8}
          roughness={1}
          fiber={0}
          fiberSize={0}
          crumples={0.3}
          crumpleSize={0.45}
          folds={0}
          foldCount={0}
          drops={0}
          fade={0}
          seed={7}
        />
      </div>
      <div className="absolute -left-[10%] top-[-20%] h-[90%] w-[55%] rounded-[40%] bg-white/70 blur-[90px] dark:bg-white/10" />
      <div className="absolute left-[18%] top-[10%] h-[45%] w-[30%] rounded-[40%] bg-white/50 blur-[70px] dark:bg-white/[0.06]" />
      <div className="absolute -right-[10%] top-[-30%] h-[170%] w-[7%] rotate-[32deg] bg-white/80 blur-[36px] dark:bg-white/[0.07]" />

      {/* WebGPU wall, fading in over the CSS one once it has drawn. */}
      {supported && (
        <canvas
          ref={canvasRef}
          className={cn(
            "absolute inset-0 block h-full w-full transition-opacity duration-700",
            live ? "opacity-100" : "opacity-0",
          )}
        />
      )}

      {/* Chalk plan on the wall, over whichever wall is showing. */}
      <ChalkBlueprint />
      <EtchedSketches />

      {/* Gallery window light: a skewed pane of sun with mullion shadows,
          falling across the wall from the upper left. */}
      <div className="absolute left-[4%] top-[-12%] h-[95%] w-[46%] -skew-x-[18deg] opacity-60 mix-blend-soft-light blur-[14px] dark:opacity-20">
        <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-[5%]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-white" />
          ))}
        </div>
      </div>

      {/* Depth: the wall falls off into shadow at its edges, like a lit room. */}
      <div className="absolute inset-0 shadow-[inset_0_0_180px_40px_rgba(40,34,26,0.28)] dark:shadow-[inset_0_0_180px_40px_rgba(0,0,0,0.6)]" />

      {/* The fade into the page below. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

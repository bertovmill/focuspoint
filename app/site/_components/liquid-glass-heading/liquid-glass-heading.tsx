"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { AnimatedHeading } from "../animated-heading";
import { createRenderer, type PaintText } from "./renderer";

type Props = {
  className?: string;
  lines: string[];
  startDelay?: number;
};

/**
 * The homepage headline as liquid glass: the vgpu "TypeGPU Liquid Glass"
 * example with the heading's own text in place of the logo.
 *
 * The real `<h1>` stays in the document, laid out by the browser as always.
 * Once WebGPU is confirmed, its text is rasterised (same font, same line
 * boxes) into the renderer, a canvas is laid over it and its ink fades to
 * transparent while the glass fades in. Without WebGPU, with reduced motion,
 * or if the renderer fails, the page is exactly the animated heading it was.
 */
export function LiquidGlassHeading({ className, lines, startDelay }: Props) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(false);
  const [shown, setShown] = useState(false);
  const [box, setBox] = useState<{ top: number; left: number; width: number; height: number }>();

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    setSupported(!reduced && "gpu" in navigator);
  }, []);

  useEffect(() => {
    const wrapper = wrapperRef.current;
    const canvas = canvasRef.current;
    const heading = wrapper?.querySelector("h1");
    if (!supported || !wrapper || !canvas || !heading) return;

    let cancelled = false;

    // The canvas covers the heading's border box, not the wrapper (which also
    // holds the heading's margin). Measured off layout, not the animated words.
    const fitCanvas = () => {
      setBox({
        top: heading.offsetTop,
        left: heading.offsetLeft,
        width: heading.offsetWidth,
        height: heading.offsetHeight,
      });
    };

    const paint: PaintText = (ctx, width, height) => {
      const style = getComputedStyle(heading);
      const headingBox = heading.getBoundingClientRect();
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#fff";
      ctx.font = `${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = style.letterSpacing;
      ctx.textBaseline = "alphabetic";
      // CSS centres the font's content area inside the line box; put the
      // baseline where the browser did.
      const metrics = ctx.measureText("Hg");
      const ascent = metrics.fontBoundingBoxAscent;
      const descent = metrics.fontBoundingBoxDescent;
      for (const line of heading.querySelectorAll<HTMLElement>("[data-line]")) {
        const rect = line.getBoundingClientRect();
        const top = rect.top - headingBox.top;
        const baseline = top + (rect.height - (ascent + descent)) / 2 + ascent;
        ctx.fillText(line.textContent ?? "", rect.left - headingBox.left, baseline);
      }
    };

    fitCanvas();
    const renderer = createRenderer({
      canvas,
      paint,
      onFirstFrame: () => {
        if (!cancelled) setShown(true);
      },
    });

    // Fonts can land after mount; a fallback-font raster would be the wrong
    // shapes. Bake again once they're in, and whenever the heading reflows.
    void document.fonts.ready.then(() => {
      if (cancelled) return;
      fitCanvas();
      renderer.requestBake();
    });
    const observer = new ResizeObserver(() => {
      fitCanvas();
      renderer.requestBake();
    });
    observer.observe(heading);

    // Adapter or shader failures are logged, not thrown into React: the
    // heading simply stays as it was.
    renderer.ready.catch((error: unknown) => {
      console.warn("Liquid glass heading could not start", error);
      if (!cancelled) setSupported(false);
    });

    return () => {
      cancelled = true;
      observer.disconnect();
      renderer.dispose();
      setShown(false);
    };
  }, [supported]);

  return (
    <div ref={wrapperRef} className="relative">
      <AnimatedHeading
        className={cn(className, "transition-colors duration-700", shown && "text-transparent")}
        lines={lines}
        startDelay={startDelay}
      />
      {supported && (
        <canvas
          ref={canvasRef}
          aria-hidden
          className={cn(
            "pointer-events-none absolute transition-opacity duration-700",
            shown ? "opacity-100" : "opacity-0",
          )}
          style={box}
        />
      )}
    </div>
  );
}

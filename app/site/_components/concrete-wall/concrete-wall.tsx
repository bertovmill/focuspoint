"use client";

import { useEffect, useRef, useState } from "react";
import { PaperTexture } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";
import { createWallRenderer } from "./renderer";

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
export function ConcreteWall({ className }: { className?: string }) {
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

    const renderer = createWallRenderer(canvas, {
      isDark: () => html.classList.contains("dark"),
      pointer: () => pointer,
      reducedMotion: () => motion.matches,
    });
    renderer.ready
      .then(() => setLive(true))
      // A wall that can't start is not an error the page should surface: the
      // CSS one is already there.
      .catch((error: unknown) => {
        console.warn("Concrete wall could not start", error);
        setSupported(false);
      });

    return () => {
      renderer.dispose();
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerleave", onLeave);
      document.removeEventListener("pointercancel", onLeave);
    };
  }, [supported]);

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

      {/* The fade into the page below. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

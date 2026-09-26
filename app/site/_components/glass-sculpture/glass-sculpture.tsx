"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createRenderer } from "./renderer";
import type { SculptureControls } from "./scene";

/** Fixed look for the site: no settings panel, so these are the whole story. */
const SITE_CONTROLS: SculptureControls = {
  shape: "knot",
  glass: "clear",
  light: "studio",
  dispersion: true,
  spin: true,
  // The example turns at a demo pace; on a page it should drift.
  spinSpeed: 0.35,
  renderScale: 0.75,
};

type Props = { className?: string };

/**
 * The vgpu "Glass sculpture" example, rendered into a canvas on the homepage.
 *
 * WebGPU is the only way this draws, and most in-app browsers plus Firefox
 * don't have it. Rather than a black box, the component renders nothing at all
 * until it has confirmed `navigator.gpu` exists — the page reads exactly as it
 * does for everyone else. On the server nothing is rendered either, which is
 * what keeps hydration honest.
 */
export function GlassSculpture({ className }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "gpu" in navigator);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!supported || !canvas) return;
    const renderer = createRenderer(canvas, SITE_CONTROLS);
    // Adapter or shader failures are logged, not thrown into React: a missing
    // sculpture should never take the homepage down with it.
    renderer.ready.catch((error: unknown) => {
      console.warn("Glass sculpture could not start", error);
      setSupported(false);
    });
    return () => renderer.dispose();
  }, [supported]);

  if (!supported) return null;

  return (
    <div
      className={cn("relative overflow-hidden", className)}
      aria-hidden
    >
      <canvas ref={canvasRef} className="block h-full w-full touch-none" />
    </div>
  );
}

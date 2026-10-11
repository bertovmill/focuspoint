"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import { PaperTexture } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";
import { createWallRenderer } from "./renderer";
import { NEUTRAL_SKY, skyAt, useSiteWeather, wallNow, type Sky } from "./sky";
import { CITY_VIEWS, DESK_ART, windowRect } from "./scene";

/**
 * A lit plaster wall behind the hero, after the backdrop on vgpu.sh, and on
 * the homepage the desk that stands against it.
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
 * Both follow the sky over the desk (`sky.ts`): the light moves and warms
 * with the sun in Toronto, dims under cloud and at night.
 *
 * `scene` is the homepage: a window cut into the wall looking out on Toronto
 * (in the shader, or a framed picture at the same spot on the CSS wall, with
 * rain running down the glass when it's raining there), and in front of it
 * the desk with the money tree, lit by the same sky. Inner pages get the bare
 * wall so their text stays readable. The desk's width is the `--desk-w`
 * custom property set by the page, which also pads its text clear of it.
 *
 * Full-bleed: the hero lives inside the page's `px-6` column, so this escapes
 * it with the `w-screen` centring trick rather than moving the hero out.
 */
export function ConcreteWall({ className, scene = false }: { className?: string; scene?: boolean }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(false);
  const [live, setLive] = useState(false);
  // The wall's shape, for placing the CSS window where the shader would.
  const [aspect, setAspect] = useState(16 / 9);

  // The sky, recomputed every half minute so the light keeps up with the clock.
  // The renderer reads it through a ref each frame. It starts neutral so the
  // server and client paint the same thing, then the real one lands on mount.
  const weather = useSiteWeather();
  const [sky, setSky] = useState<Sky>(NEUTRAL_SKY);
  const skyRef = useRef(sky);
  useEffect(() => {
    const update = () => {
      const next = skyAt(wallNow(), weather);
      skyRef.current = next;
      setSky(next);
    };
    update();
    const id = window.setInterval(update, 30_000);
    return () => window.clearInterval(id);
  }, [weather]);

  useEffect(() => {
    setSupported(typeof navigator !== "undefined" && "gpu" in navigator);
  }, []);

  useEffect(() => {
    const root = rootRef.current;
    if (!scene || !root) return;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (width > 0 && height > 0) setAspect(width / height);
    });
    observer.observe(root);
    return () => observer.disconnect();
  }, [scene]);

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
      sky: () => skyRef.current,
      scene,
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
  }, [supported, scene]);

  const rect = windowRect(aspect);
  const overcast = sky.cloudCover * (1 - sky.night);
  // How much light reaches the desk: less after dark and under a heavy sky,
  // and the colour drains a little at night.
  const deskStyle = {
    bottom: "calc(var(--desk-w) * -0.1675)",
    "--desk-light": (1 - sky.night * 0.45 - overcast * 0.12).toFixed(3),
    "--desk-tone": (1 - sky.night * 0.25).toFixed(3),
  } as CSSProperties;

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

      {/* The window on the CSS wall: the same opening, as a framed picture
          that cross-fades through the day. Only while the shader isn't up. */}
      {scene && !live && (
        <div
          className="absolute overflow-hidden bg-[#9fb3c8] [--frame:#ebe7e0] dark:[--frame:#3d3b38]"
          style={{
            left: `${(rect.x - rect.hw) * 100}%`,
            top: `${(rect.y - rect.hh) * 100}%`,
            width: `${rect.hw * 200}%`,
            height: `${rect.hh * 200}%`,
            boxShadow:
              "0 0 0 10px var(--frame), 0 0 0 11px rgba(0,0,0,0.14), 0 0 0 34px rgba(0,0,0,0.06), 0 28px 34px -8px rgba(30,25,20,0.32)",
          }}
        >
          <Image src={CITY_VIEWS[0]} alt="" fill sizes="50vw" className="object-cover" />
          <Image
            src={CITY_VIEWS[3]}
            alt=""
            fill
            sizes="50vw"
            className="object-cover transition-opacity duration-1000"
            style={{ opacity: overcast }}
          />
          <Image
            src={CITY_VIEWS[2]}
            alt=""
            fill
            sizes="50vw"
            className="object-cover transition-opacity duration-1000"
            style={{ opacity: sky.night }}
          />
          <div className="absolute inset-y-0 left-1/2 w-[2.5%] -translate-x-1/2 bg-[var(--frame)]" />
          {/* The reveal's shadow on the glass, so it reads as set into the wall. */}
          <div className="absolute inset-0 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25),inset_0_22px_30px_-12px_rgba(0,0,0,0.5),inset_14px_0_24px_-14px_rgba(0,0,0,0.35)]" />
        </div>
      )}

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

      {/* Evening and overcast: the CSS wall has no sky of its own, so it gets
          a cool wash instead. Over the WebGPU wall too, but lightly, since the
          shader already dims itself. */}
      <div
        className="absolute inset-0 bg-[#3a4150] mix-blend-multiply transition-opacity duration-1000"
        style={{ opacity: (live ? 0.06 : 0.22) * Math.max(sky.night, sky.cloudCover * 0.9) }}
      />

      {/* Gallery window light: a skewed pane of sun with mullion shadows,
          falling across the wall from the upper left. Fades with the daylight. */}
      <div
        className="absolute left-[4%] top-[-12%] h-[95%] w-[46%] -skew-x-[18deg] mix-blend-soft-light blur-[14px] transition-opacity duration-1000 [--pane:0.6] dark:[--pane:0.2]"
        style={{ opacity: `calc(var(--pane) * ${(1 - sky.night * 0.85) * (1 - sky.cloudCover * 0.55)})` }}
      >
        <div className="grid h-full w-full grid-cols-3 grid-rows-2 gap-[5%]">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="bg-white" />
          ))}
        </div>
      </div>

      {/* Depth: the wall falls off into shadow at its edges, like a lit room. */}
      <div className="absolute inset-0 shadow-[inset_0_0_180px_40px_rgba(40,34,26,0.28)] dark:shadow-[inset_0_0_180px_40px_rgba(0,0,0,0.6)]" />

      {/* The desk, up against the wall with the money tree on it. It sits low
          enough that only the top of its legs show before the page takes over,
          and throws a soft shadow onto the plaster from the window light. */}
      {scene && (
        <div
          className="absolute right-[2vw] w-[var(--desk-w)] [--desk-dim:1] [--desk-shadow:rgba(35,28,20,0.38)] dark:[--desk-dim:0.72] dark:[--desk-shadow:rgba(0,0,0,0.6)]"
          style={deskStyle}
        >
          <Image
            src={DESK_ART.src}
            alt=""
            width={DESK_ART.width}
            height={DESK_ART.height}
            priority
            sizes="(min-width: 1024px) 60vw, (min-width: 640px) 85vw, 110vw"
            className="h-auto w-full transition-[filter] duration-1000"
            style={{
              filter:
                "drop-shadow(18px 22px 24px var(--desk-shadow)) brightness(calc(var(--desk-light) * var(--desk-dim))) saturate(var(--desk-tone))",
            }}
          />
        </div>
      )}

      {/* The fade into the page below. */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

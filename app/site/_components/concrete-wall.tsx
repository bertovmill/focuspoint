"use client";

import { PaperTexture } from "@paper-design/shaders-react";
import { cn } from "@/lib/utils";

/**
 * A lit concrete wall behind the hero, after the backdrop on vgpu.sh: a warm
 * grey plaster surface with soft window light falling across it.
 *
 * Three layers, back to front:
 * 1. the wall — a paper shader at `speed: 0`, so it renders one mottled frame
 *    and holds; roughness up and fibres off is what turns paper into render
 * 2. the light — two soft window-shaped patches and one diagonal band, plain
 *    CSS gradients blurred heavily so they read as light on a surface, not as
 *    shapes painted on it
 * 3. a fade at the bottom into the page background, so the section below
 *    doesn't start on a hard edge
 *
 * Full-bleed: the hero lives inside the page's `px-6` column, so this escapes
 * it with the `w-screen` centring trick rather than moving the hero out.
 */
export function ConcreteWall({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute inset-y-0 left-1/2 -z-10 w-screen -translate-x-1/2 overflow-hidden",
        className,
      )}
    >
      {/* 1. the wall */}
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

      {/* 2. the light */}
      <div className="absolute -left-[10%] top-[-20%] h-[90%] w-[55%] rounded-[40%] bg-white/70 blur-[90px] dark:bg-white/10" />
      <div className="absolute left-[18%] top-[10%] h-[45%] w-[30%] rounded-[40%] bg-white/50 blur-[70px] dark:bg-white/[0.06]" />
      <div className="absolute -right-[10%] top-[-30%] h-[170%] w-[7%] rotate-[32deg] bg-white/80 blur-[36px] dark:bg-white/[0.07]" />

      {/* 3. the fade into the page */}
      <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background" />
    </div>
  );
}

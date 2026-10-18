"use client";

import { cn } from "@/lib/utils";

/**
 * Protein eaten today against the target. The arc fills clockwise and turns
 * green once the target is cleared; going past it keeps the ring full rather
 * than wrapping, so 190/160 doesn't look like 30/160.
 */
export function ProteinRing({
  eaten,
  target,
  size = 96,
  className,
}: {
  eaten: number;
  target: number;
  size?: number;
  className?: string;
}) {
  const r = 42;
  const c = 2 * Math.PI * r;
  const pct = target > 0 ? Math.min(1, eaten / target) : 0;
  const done = target > 0 && eaten >= target;
  return (
    <div className={cn("relative shrink-0", className)} style={{ width: size, height: size }}>
      <svg viewBox="0 0 100 100" className="size-full -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" strokeWidth="8" className="stroke-muted" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - pct)}
          className={cn("transition-[stroke-dashoffset] duration-700", done ? "stroke-emerald-500" : "stroke-foreground")}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-lg font-semibold tabular-nums">{Math.round(eaten)}</span>
        <span className="text-[10px] text-muted-foreground tabular-nums">/ {target} g</span>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export const ZONES = [
  { label: "Light", effort: "easy", color: "bg-sky-400" },
  { label: "Fat burn", effort: "moderate", color: "bg-amber-400" },
  { label: "Cardio", effort: "hard", color: "bg-orange-500" },
  { label: "Peak", effort: "max effort", color: "bg-rose-600" },
];

/**
 * Time in each heart-rate zone (seconds: light, fat burn, cardio, peak) as one stacked bar.
 * Hovering shows what each colour is and how long was spent in it, with the zone under
 * the pointer picked out (Berto, 2026-11-01: the bare colours were confusing).
 */
export function ZoneBar({ zones, className }: { zones: number[]; className?: string }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const total = zones.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const summary = zones.map((z, i) => `${ZONES[i]?.label}: ${Math.round(z / 60)} min`).join(" · ");
  return (
    <Tooltip onOpenChange={(open) => !open && setHovered(null)}>
      <TooltipTrigger asChild>
        <span
          tabIndex={0}
          aria-label={`Heart-rate zones: ${summary}`}
          className={cn("flex w-full cursor-help overflow-hidden rounded-full bg-muted outline-none focus-visible:ring-2 focus-visible:ring-ring", className)}
          onMouseLeave={() => setHovered(null)}
        >
          {zones.map((z, i) =>
            z > 0 ? (
              <span
                key={i}
                className={cn(ZONES[i]?.color, "transition-opacity", hovered !== null && hovered !== i && "opacity-40")}
                style={{ width: `${(z / total) * 100}%` }}
                onMouseEnter={() => setHovered(i)}
              />
            ) : null,
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="px-3 py-2">
        <p className="mb-1.5 font-medium">Time in heart-rate zones</p>
        <ul className="space-y-1">
          {zones.map((z, i) => (
            <li
              key={i}
              className={cn(
                "flex items-center gap-2 tabular-nums transition-opacity",
                hovered !== null && hovered !== i && "opacity-50",
                z === 0 && "opacity-50",
              )}
            >
              <span className={cn("size-2 shrink-0 rounded-full", ZONES[i]?.color)} />
              <span className="w-16">{ZONES[i]?.label}</span>
              <span className="w-12 text-right">{Math.round(z / 60)} min</span>
              <span className="w-9 text-right opacity-70">{Math.round((z / total) * 100)}%</span>
              <span className="opacity-70">{ZONES[i]?.effort}</span>
            </li>
          ))}
        </ul>
      </TooltipContent>
    </Tooltip>
  );
}

"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { skyLabel, useSiteWeather, wallNow } from "./sky";

/**
 * The visitor's own place, time and weather, written small on the wall, e.g.
 * "TORONTO · 4:12 PM · RAIN". It's what the wall's light is following.
 *
 * Renders nothing on the server (the time and place are the visitor's), then
 * fades in, so there's no hydration mismatch and no flash of a wrong time.
 */
export function WallClock({ className }: { className?: string }) {
  const weather = useSiteWeather();
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setLabel(skyLabel(wallNow(), weather));
    update();
    // Tick on the minute, not every 60s from mount, so it never lags the clock.
    let interval: number | undefined;
    const timeout = window.setTimeout(() => {
      update();
      interval = window.setInterval(update, 60_000);
    }, 60_000 - (Date.now() % 60_000));
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
    };
  }, [weather]);

  return (
    <p
      className={cn(
        "min-h-[1lh] font-mono text-xs uppercase tracking-[0.18em] text-foreground/60 transition-opacity duration-700",
        label ? "opacity-100" : "opacity-0",
        className,
      )}
    >
      {label}
    </p>
  );
}

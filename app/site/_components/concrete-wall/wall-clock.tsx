"use client";

import { useEffect, useState } from "react";
import {
  CloudMoonIcon,
  CloudRainIcon,
  CloudSunIcon,
  CloudyIcon,
  MoonIcon,
  RotateCcwIcon,
  SunIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  dialFor,
  setWeatherDial,
  skyAt,
  skyLabel,
  useLiveWeather,
  useSiteWeather,
  useWeatherDial,
  wallNow,
} from "./sky";

/** The dial's stops, matching `weatherAtDial` in sky.ts. */
const STOPS = [
  { at: 0, label: "Sunny", Icon: SunIcon },
  { at: 1 / 3, label: "Cloudy", Icon: CloudSunIcon },
  { at: 2 / 3, label: "Overcast", Icon: CloudyIcon },
  { at: 1, label: "Rain", Icon: CloudRainIcon },
] as const;

/**
 * The visitor's own place, time and weather, written small on the wall, e.g.
 * "TORONTO · 4:12 PM · RAIN". It's what the wall's light is following.
 *
 * Under it, a row of round weather buttons (sunny, cloudy, overcast, rain) to
 * see the wall in other weather. It starts wherever the visitor's real weather puts it, and "Live"
 * hands the sky back to the real thing.
 *
 * Renders nothing on the server (the time and place are the visitor's), then
 * fades in, so there's no hydration mismatch and no flash of a wrong time.
 */
export function WallClock({ className }: { className?: string }) {
  const live = useLiveWeather();
  const weather = useSiteWeather();
  const held = useWeatherDial();
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    const update = () => setNow(wallNow());
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
  }, []);

  const label = now ? skyLabel(now, weather) : null;
  const value = held ?? (live ? dialFor(live) : null);
  // No sun to speak of after dark, so the first stop reads "Clear" then.
  const night = now && live ? skyAt(now, live).night > 0.5 : false;
  const nearest = value === null ? -1 : Math.round(value * 3);

  return (
    <div className={className}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <p
          className={cn(
            "min-h-[1lh] font-mono text-xs uppercase tracking-[0.18em] text-foreground/60 transition-opacity duration-700",
            label ? "opacity-100" : "opacity-0",
          )}
        >
          {label}
        </p>
        {held !== null && (
          <button
            type="button"
            onClick={() => setWeatherDial(null)}
            className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-[0.18em] text-foreground/45 transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none"
          >
            <RotateCcwIcon aria-hidden className="size-3" />
            Live
          </button>
        )}
      </div>

      {/* Fixed height so the headline doesn't jump when the buttons arrive. */}
      <div
        role="radiogroup"
        aria-label="Weather"
        className={cn(
          "mt-3 flex h-[4.25rem] gap-4 transition-opacity duration-700",
          value === null ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {value !== null &&
          STOPS.map((stop, i) => {
            const active = i === nearest;
            // After dark the sun gives way to the moon.
            const Icon =
              night && i === 0 ? MoonIcon : night && i === 1 ? CloudMoonIcon : stop.Icon;
            const label = i === 0 && night ? "Clear" : stop.label;
            return (
              <button
                key={stop.at}
                type="button"
                role="radio"
                aria-checked={active}
                aria-label={label}
                onClick={() => setWeatherDial(stop.at)}
                className="group flex w-14 flex-col items-center gap-1.5 focus-visible:outline-none"
              >
                <span
                  className={cn(
                    "grid size-11 place-items-center rounded-full transition-all duration-200 group-active:scale-95 group-focus-visible:ring-2 group-focus-visible:ring-foreground/40",
                    active
                      ? "bg-foreground text-background shadow-[0_2px_8px_rgba(0,0,0,0.25)]"
                      : "bg-background/45 text-foreground/70 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)] backdrop-blur-md group-hover:bg-background/70 group-hover:text-foreground",
                  )}
                >
                  <Icon aria-hidden className="size-5" strokeWidth={1.75} />
                </span>
                <span
                  className={cn(
                    "font-mono text-[10px] uppercase tracking-[0.16em] transition-colors",
                    active ? "text-foreground/80" : "text-foreground/45 group-hover:text-foreground/70",
                  )}
                >
                  {label}
                </span>
              </button>
            );
          })}
      </div>
    </div>
  );
}

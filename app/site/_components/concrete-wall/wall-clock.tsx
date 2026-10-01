"use client";

import { useEffect, useState } from "react";
import { Slider } from "radix-ui";
import { RotateCcwIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  conditionLabel,
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
  { at: 0, label: "Sunny" },
  { at: 1 / 3, label: "Cloudy" },
  { at: 2 / 3, label: "Overcast" },
  { at: 1, label: "Rain" },
] as const;

/**
 * The visitor's own place, time and weather, written small on the wall, e.g.
 * "TORONTO · 4:12 PM · RAIN". It's what the wall's light is following.
 *
 * Under it, a weather dial: drag from sunny to rain to see the wall in other
 * weather. It starts wherever the visitor's real weather puts it, and "Live"
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
  const condition = now && weather ? conditionLabel(now, weather) : undefined;

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

      {/* Fixed height so the headline doesn't jump when the dial arrives. */}
      <div
        className={cn(
          "mt-3 h-9 w-64 transition-opacity duration-700 sm:w-72",
          value === null ? "pointer-events-none opacity-0" : "opacity-100",
        )}
      >
        {value !== null && (
          <>
            <Slider.Root
              value={[value]}
              min={0}
              max={1}
              step={0.01}
              onValueChange={([next]) => setWeatherDial(next)}
              className="relative flex h-4 w-full touch-none select-none items-center"
            >
              <Slider.Track className="relative h-px w-full grow bg-foreground/25">
                <Slider.Range className="absolute h-full bg-foreground/55" />
                {STOPS.map((stop) => (
                  <span
                    key={stop.at}
                    aria-hidden
                    className="absolute top-1/2 size-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/40"
                    style={{ left: `${stop.at * 100}%` }}
                  />
                ))}
              </Slider.Track>
              <Slider.Thumb
                aria-label="Weather"
                aria-valuetext={condition}
                className="block size-3.5 cursor-grab rounded-full bg-foreground shadow-[0_1px_4px_rgba(0,0,0,0.25)] ring-4 ring-background/50 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-foreground/25 active:cursor-grabbing"
              />
            </Slider.Root>
            <div className="relative mt-1.5 h-4">
              {STOPS.map((stop, i) => (
                <button
                  key={stop.at}
                  type="button"
                  onClick={() => setWeatherDial(stop.at)}
                  className={cn(
                    "absolute top-0 font-mono text-[10px] uppercase tracking-[0.16em] transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none",
                    i === nearest ? "text-foreground/75" : "text-foreground/40",
                  )}
                  style={{
                    left: `${stop.at * 100}%`,
                    transform: `translateX(${i === 0 ? 0 : i === STOPS.length - 1 ? -100 : -50}%)`,
                  }}
                >
                  {i === 0 && night ? "Clear" : stop.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

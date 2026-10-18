"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SiteWeather } from "@/app/api/site/weather/route";

/**
 * The sky over the desk, as the wall uses it: where the sun is right now in
 * Toronto, and what the weather is doing there.
 *
 * The desk is in Toronto, so the wall keeps Toronto's clock and weather for
 * every visitor: the window looks out on the city, and the light through it
 * is the light that is really falling on the desk right now. Weather is
 * fetched once per page load and shared by everything that asks (the wall and
 * its clock label); the time of day is worked out from the visitor's clock in
 * Toronto's zone.
 *
 * For checking the look without waiting for a storm, two query params
 * override the real values: `?weather=rain|drizzle|storm|snow|fog|cloudy|clear`
 * and `?hour=21.5` (Toronto hour, decimals allowed). Visitors can also drag
 * the weather dial under the clock (see `setWeatherDial`).
 */

/** Where the desk is. */
export const WALL_ZONE = "America/Toronto";
export const WALL_CITY = "Toronto";

/** What the shader gets, all 0 to 1. */
export type Sky = {
  /** Sun height: 0 at the horizon or below, 1 at solar noon. */
  sunHeight: number;
  /** How far through the day the sun is: 0 at sunrise, 1 at sunset. */
  sunProgress: number;
  /** Golden-hour warmth of the sunlight. */
  warmth: number;
  /** 1 once it is properly dark out. */
  night: number;
  cloudCover: number;
  /** Drops on the window. */
  rain: number;
};

/**
 * What the wall renders before it knows the time: a clear noon. The server
 * and the client's first paint must agree exactly (any inline style that
 * differs is a hydration mismatch React refuses to patch), and only the
 * client can read Toronto's clock and the `?hour=` override, so the real sky
 * arrives in an effect and the wall transitions to it.
 */
export const NEUTRAL_SKY: Sky = { sunHeight: 1, sunProgress: 0.5, warmth: 0, night: 0, cloudCover: 0, rain: 0 };

const OVERRIDES = new Set<SiteWeather["condition"]>(["clear", "cloudy", "fog", "drizzle", "rain", "snow", "storm"]);

let weatherRequest: Promise<SiteWeather | null> | null = null;

function loadWeather(): Promise<SiteWeather | null> {
  weatherRequest ??= fetch("/api/site/weather")
    .then((res) => (res.ok ? (res.json() as Promise<SiteWeather>) : null))
    .catch(() => null);
  return weatherRequest;
}

function params() {
  if (typeof window === "undefined") return new URLSearchParams();
  return new URLSearchParams(window.location.search);
}

/** The weather with any `?weather=` override applied. Null until it arrives. */
export function useLiveWeather(): SiteWeather | null {
  const [weather, setWeather] = useState<SiteWeather | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadWeather().then((real) => {
      if (cancelled) return;
      const forced = params().get("weather") as SiteWeather["condition"] | null;
      const base: SiteWeather = real ?? {
        city: WALL_CITY,
        condition: "clear",
        precipitation: 0,
        cloudCover: 0,
        sunrise: null,
        sunset: null,
      };
      if (forced && OVERRIDES.has(forced)) {
        const wet = forced === "rain" || forced === "storm" || forced === "drizzle";
        setWeather({
          ...base,
          condition: forced,
          precipitation: wet ? (forced === "drizzle" ? 0.35 : forced === "storm" ? 1 : 0.7) : 0,
          cloudCover: forced === "clear" ? 0.05 : forced === "cloudy" ? 0.85 : 0.95,
        });
      } else {
        setWeather(base);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return weather;
}

/**
 * The weather dial: one number from 0 to 1 that visitors drag to see the wall
 * in other weather. Four stops, sunny (0), cloudy (1/3), overcast (2/3) and
 * rain (1); cloud builds over the first two thirds and rain comes in over the
 * last. Null follows the real weather. Kept in memory for the visit and shared
 * by everything that reads the sky, so the wall and its label move together.
 */
let dial: number | null = null;
const dialListeners = new Set<() => void>();

export function setWeatherDial(value: number | null) {
  dial = value === null ? null : Math.min(1, Math.max(0, value));
  dialListeners.forEach((listener) => listener());
}

function subscribeToDial(listener: () => void) {
  dialListeners.add(listener);
  return () => {
    dialListeners.delete(listener);
  };
}

/** The dial while someone is holding it somewhere, null when it's on live. */
export function useWeatherDial(): number | null {
  return useSyncExternalStore(subscribeToDial, () => dial, () => null);
}

/** Where the dial sits for some weather, so it starts at the real one. */
export function dialFor(weather: SiteWeather): number {
  if (weather.precipitation > 0) return 2 / 3 + Math.min(1, weather.precipitation) / 3;
  return (Math.min(1, Math.max(0, weather.cloudCover)) * 2) / 3;
}

/** The weather a dial position stands for, keeping the city and its sun. */
function weatherAtDial(value: number, base: SiteWeather): SiteWeather {
  const cloudCover = Math.min(1, value * 1.5);
  const precipitation = Math.max(0, value * 3 - 2);
  const condition: SiteWeather["condition"] =
    precipitation > 0.4 ? "rain" : precipitation > 0 ? "drizzle" : cloudCover < 0.2 ? "clear" : "cloudy";
  return { ...base, condition, cloudCover, precipitation };
}

/** The sky the wall shows: the live weather, or wherever the dial is held. */
export function useSiteWeather(): SiteWeather | null {
  const live = useLiveWeather();
  const held = useWeatherDial();
  return useMemo(() => (live && held !== null ? weatherAtDial(held, live) : live), [live, held]);
}

/** Now. The `?hour=` override is applied where the time of day is read. */
export function wallNow(): Date {
  return new Date();
}

/** The `?hour=` override as seconds into the day, or null when it isn't set. */
function overrideSeconds(): number | null {
  const search = params();
  if (!search.has("hour")) return null;
  const hour = Number(search.get("hour"));
  return Number.isFinite(hour) ? ((hour % 24) + 24) % 24 * 3600 : null;
}

const zoneTime = new Intl.DateTimeFormat("en-US", {
  timeZone: WALL_ZONE,
  hourCycle: "h23",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
});

/** Seconds since midnight in Toronto for an instant. */
function secondsIntoDay(date: Date): number {
  const parts = zoneTime.formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return (get("hour") % 24) * 3600 + get("minute") * 60 + get("second");
}

/** Toronto's time of day for an instant, in seconds, with the override applied. */
function wallSeconds(now: Date): number {
  return overrideSeconds() ?? secondsIntoDay(now);
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/**
 * Sun and weather for a moment. Without sunrise/sunset from the weather API
 * (offline, or not loaded yet) it assumes a 6:30 to 19:00 day.
 */
export function skyAt(now: Date, weather: SiteWeather | null): Sky {
  let sunrise: number;
  let sunset: number;
  if (weather?.sunrise && weather?.sunset) {
    sunrise = secondsIntoDay(new Date(weather.sunrise * 1000));
    sunset = secondsIntoDay(new Date(weather.sunset * 1000));
    if (sunset <= sunrise) sunset += 86400;
  } else {
    sunrise = 6.5 * 3600;
    sunset = 19 * 3600;
  }

  const t = wallSeconds(now);
  const progress = (t - sunrise) / (sunset - sunrise);
  const sunHeight = progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) : 0;
  // Civil twilight, roughly: light lingers ~40 minutes either side.
  const twilight = Math.max(
    smoothstep(sunrise - 2400, sunrise, t) * (t < sunrise ? 1 : 0),
    smoothstep(sunset + 2400, sunset, t) * (t > sunset ? 1 : 0),
  );
  const night = sunHeight > 0 ? 0 : 1 - twilight * 0.7;

  const cloudCover = weather?.cloudCover ?? 0;
  return {
    sunHeight,
    sunProgress: Math.min(1, Math.max(0, progress)),
    warmth: sunHeight > 0 ? 1 - smoothstep(0.05, 0.55, sunHeight) : twilight,
    night,
    cloudCover,
    rain: weather?.precipitation ?? 0,
  };
}

const CONDITION_LABEL: Record<SiteWeather["condition"], string> = {
  clear: "Clear",
  cloudy: "Cloudy",
  fog: "Fog",
  drizzle: "Drizzle",
  rain: "Rain",
  snow: "Snow",
  storm: "Thunderstorm",
};

/** Toronto's clock, e.g. "4:12 PM", honouring the `?hour=` override. */
function wallTimeLabel(now: Date): string {
  const forced = overrideSeconds();
  if (forced !== null) {
    const d = new Date(2000, 0, 1, Math.floor(forced / 3600), Math.round((forced % 3600) / 60));
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }
  return now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: WALL_ZONE });
}

/** e.g. "Toronto · 4:12 PM · Rain". */
export function skyLabel(now: Date, weather: SiteWeather | null): string {
  const parts = [weather?.city || WALL_CITY, wallTimeLabel(now)];
  if (weather) parts.push(conditionLabel(now, weather));
  return parts.filter(Boolean).join(" · ");
}

/** e.g. "Rain", "Overcast", "Clear night". */
export function conditionLabel(now: Date, weather: SiteWeather): string {
  if (weather.condition === "clear" && skyAt(now, weather).night > 0.5) return "Clear night";
  if (weather.condition === "cloudy" && weather.cloudCover >= 0.9) return "Overcast";
  return CONDITION_LABEL[weather.condition];
}

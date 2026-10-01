"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { SiteWeather } from "@/app/api/site/weather/route";

/**
 * The visitor's sky, as the wall uses it: where the sun is right now in their
 * time zone, and what the weather is doing where they are.
 *
 * Weather is fetched once per page load and shared by everything that asks
 * (the wall and its clock label). Time is read from the visitor's own clock,
 * so the light follows their day, not the server's.
 *
 * For checking the look without waiting for a storm, two query params
 * override the real values: `?weather=rain|drizzle|storm|snow|fog|cloudy|clear`
 * and `?hour=21.5` (local hour, decimals allowed). Visitors can also drag the
 * weather dial under the clock (see `setWeatherDial`).
 */

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
        city: null,
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

/** Where the dial sits for some weather, so it starts at the visitor's own. */
export function dialFor(weather: SiteWeather): number {
  if (weather.precipitation > 0) return 2 / 3 + Math.min(1, weather.precipitation) / 3;
  return (Math.min(1, Math.max(0, weather.cloudCover)) * 2) / 3;
}

/** The weather a dial position stands for, keeping the visitor's city and sun. */
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

/** Now, or the `?hour=` override on today's date. */
export function wallNow(): Date {
  const hour = Number(params().get("hour"));
  const now = new Date();
  if (!params().has("hour") || !Number.isFinite(hour)) return now;
  const d = new Date(now);
  d.setHours(Math.floor(hour), Math.round((hour % 1) * 60), 0, 0);
  return d;
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
  const midnight = new Date(now);
  midnight.setHours(0, 0, 0, 0);
  const dayStart = midnight.getTime() / 1000;
  // Today's times only line up with "now" when the ?hour override isn't moving
  // us around; either way we only use their time of day.
  if (weather?.sunrise && weather?.sunset) {
    sunrise = dayStart + secondsIntoDay(weather.sunrise);
    sunset = dayStart + secondsIntoDay(weather.sunset);
    if (sunset <= sunrise) sunset += 86400;
  } else {
    sunrise = dayStart + 6.5 * 3600;
    sunset = dayStart + 19 * 3600;
  }

  const t = now.getTime() / 1000;
  const progress = (t - sunrise) / (sunset - sunrise);
  const sunHeight = progress > 0 && progress < 1 ? Math.sin(Math.PI * progress) : 0;
  // Civil twilight, roughly: light lingers ~40 minutes either side.
  const twilight = Math.max(smoothstep(sunrise - 2400, sunrise, t) * (t < sunrise ? 1 : 0), smoothstep(sunset + 2400, sunset, t) * (t > sunset ? 1 : 0));
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

// Sunrise/sunset come as unix seconds at the visitor's location; the wall only
// needs the local time of day, which the browser's own offset gives us.
function secondsIntoDay(unix: number) {
  const d = new Date(unix * 1000);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
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

/** e.g. "Toronto · 4:12 PM · Rain". The city falls back to the time zone's. */
export function skyLabel(now: Date, weather: SiteWeather | null): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "";
  const zoneCity = zone.split("/").pop()?.replace(/_/g, " ") ?? "";
  const city = weather?.city || zoneCity;
  const time = now.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const parts = [city, time];
  if (weather) parts.push(conditionLabel(now, weather));
  return parts.filter(Boolean).join(" · ");
}

/** e.g. "Rain", "Overcast", "Clear night". */
export function conditionLabel(now: Date, weather: SiteWeather): string {
  if (weather.condition === "clear" && skyAt(now, weather).night > 0.5) return "Clear night";
  if (weather.condition === "cloudy" && weather.cloudCover >= 0.9) return "Overcast";
  return CONDITION_LABEL[weather.condition];
}

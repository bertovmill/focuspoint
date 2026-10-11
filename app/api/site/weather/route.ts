/**
 * The sky over the desk, for the concrete wall on bertomill.com.
 *
 * The desk is in Toronto, and the window in the wall looks out on it, so this
 * always answers for Toronto: the same light falls on the wall for every
 * visitor, wherever they are. Conditions come from Open-Meteo (free, no key).
 *
 * Public and unauthenticated like the rest of /api/site; it carries nothing
 * about the caller.
 */

const TORONTO = { city: "Toronto", latitude: "43.7", longitude: "-79.4" };

export type SiteWeather = {
  city: string | null;
  /** What the wall should do with it. */
  condition: "clear" | "cloudy" | "fog" | "drizzle" | "rain" | "snow" | "storm";
  /** 0 to 1: how hard it is coming down, for the drops on the window. */
  precipitation: number;
  /** 0 to 1. */
  cloudCover: number;
  /** Unix seconds for today's sunrise and sunset in Toronto. */
  sunrise: number | null;
  sunset: number | null;
};

// WMO weather interpretation codes, as Open-Meteo reports them.
function conditionFor(code: number): SiteWeather["condition"] {
  if (code >= 95) return "storm";
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return "snow";
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return "rain";
  if (code >= 51 && code <= 57) return "drizzle";
  if (code === 45 || code === 48) return "fog";
  if (code >= 2) return "cloudy";
  return "clear";
}

export async function GET() {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", TORONTO.latitude);
  url.searchParams.set("longitude", TORONTO.longitude);
  url.searchParams.set("current", "weather_code,precipitation,cloud_cover");
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("timeformat", "unixtime");
  url.searchParams.set("timezone", "America/Toronto");
  url.searchParams.set("forecast_days", "1");

  try {
    const res = await fetch(url, { next: { revalidate: 900 }, signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(`open-meteo ${res.status}`);
    const data = (await res.json()) as {
      current?: { weather_code?: number; precipitation?: number; cloud_cover?: number };
      daily?: { sunrise?: number[]; sunset?: number[] };
    };
    const condition = conditionFor(data.current?.weather_code ?? 0);
    const mm = data.current?.precipitation ?? 0;
    const wet = condition === "rain" || condition === "drizzle" || condition === "storm";
    const body: SiteWeather = {
      city: TORONTO.city,
      condition,
      // Drizzle still gets a few drops; a downpour (~4 mm/h and up) saturates.
      precipitation: wet ? Math.min(1, Math.max(condition === "drizzle" ? 0.25 : 0.45, mm / 4)) : 0,
      cloudCover: Math.min(1, Math.max(0, (data.current?.cloud_cover ?? 0) / 100)),
      sunrise: data.daily?.sunrise?.[0] ?? null,
      sunset: data.daily?.sunset?.[0] ?? null,
    };
    return Response.json(body, {
      // The same answer for everyone, so the CDN can hold it for a while.
      headers: { "Cache-Control": "public, max-age=300, s-maxage=600, stale-while-revalidate=1800" },
    });
  } catch (error) {
    console.warn("site weather unavailable", error);
    const body: SiteWeather = {
      city: TORONTO.city,
      condition: "clear",
      precipitation: 0,
      cloudCover: 0,
      sunrise: null,
      sunset: null,
    };
    return Response.json(body, { headers: { "Cache-Control": "public, max-age=60" } });
  }
}

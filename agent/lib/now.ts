// Timezone-aware "now" helpers. The model has no reliable sense of the current
// date, so we compute it from the server clock in the user's timezone and feed
// it in (via dynamic instructions) and use it as the calendar default.
export const TIME_ZONE = process.env.GOOGLE_CALENDAR_TIMEZONE ?? "America/Toronto";

/** Today's date as YYYY-MM-DD in the configured timezone. */
export function todayISO(): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(new Date());
}

/**
 * RFC3339 day bounds for a date range, anchored to the configured timezone's
 * offset (not the server's). Correct whether the process runs in Toronto
 * locally or UTC on Vercel.
 */
export function zonedDayBounds(startISO: string, endISO: string): { timeMin: string; timeMax: string } {
  const offset = (d: string): string => {
    const name =
      new Intl.DateTimeFormat("en-US", { timeZone: TIME_ZONE, timeZoneName: "longOffset" })
        .formatToParts(new Date(`${d}T12:00:00Z`))
        .find((p) => p.type === "timeZoneName")?.value ?? "GMT+00:00";
    // "GMT-04:00" -> "-04:00"; bare "GMT" (UTC) -> "+00:00"
    return name.replace("GMT", "") || "+00:00";
  };
  return {
    timeMin: `${startISO}T00:00:00${offset(startISO)}`,
    timeMax: `${endISO}T23:59:59${offset(endISO)}`,
  };
}

/** Human-readable current date + time, e.g. "Sunday, June 28, 2026, 2:53 PM EDT". */
export function nowHuman(): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date());
}

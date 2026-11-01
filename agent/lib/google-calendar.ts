import { getAccessToken } from "@/lib/google";

import { TIME_ZONE } from "./now";

// Google Calendar auth for the agent tools. The token comes from the same
// stored connection the app's calendar UI uses (lib/google.ts: the google_auth
// row from "Connect Google Calendar", seeded from GOOGLE_REFRESH_TOKEN when no
// row exists), so reconnecting in the app fixes chat, MCP and the digest too.
// These tools used to mint from GOOGLE_REFRESH_TOKEN alone; once that env token
// went stale every agent calendar call said "not connected" while the UI worked.
//
// GOOGLE_CALENDAR_ACCESS_TOKEN still works as a manual override (handy for a
// quick test), and takes precedence when set.

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";

/**
 * Resolve a Google access token. Prefers an explicit GOOGLE_CALENDAR_ACCESS_TOKEN
 * override, otherwise the app's stored, auto-refreshed connection. Returns null
 * when nothing is connected so callers degrade gracefully instead of throwing.
 */
export async function resolveGoogleToken(): Promise<string | null> {
  const override = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (override) return override;
  try {
    return await getAccessToken();
  } catch {
    return null;
  }
}

export const CALENDAR_NOT_CONNECTED =
  "Google Calendar isn't connected. Open Cael's calendar and click \"Connect Google Calendar\" " +
  "(or visit /api/google/connect).";

export interface CalendarEventInput {
  title: string;
  date: string;
  time?: string;
  durationMinutes?: number;
  description?: string;
  /** RFC 5545 lines, e.g. ["RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"]. */
  recurrence?: string[];
  /** Pop-up reminders, minutes before the start. Omit for the calendar's defaults. */
  popupMinutes?: number[];
}

/** Adds minutes to a wall-clock "YYYY-MM-DDTHH:MM:SS" without passing through the server's time zone. */
function addMinutesToWallClock(local: string, minutes: number): string {
  const d = new Date(`${local}Z`);
  d.setUTCMinutes(d.getUTCMinutes() + minutes);
  return d.toISOString().slice(0, 19);
}

export async function createCalendarEvent(token: string, ev: CalendarEventInput) {
  const isAllDay = !ev.time;
  const start = isAllDay
    ? { date: ev.date }
    : { dateTime: `${ev.date}T${ev.time}:00`, timeZone: TIME_ZONE };
  // Google's all-day end date is exclusive: end == start is an empty range (400).
  const end = isAllDay
    ? { date: addMinutesToWallClock(`${ev.date}T00:00:00`, 24 * 60).slice(0, 10) }
    : { dateTime: addMinutesToWallClock(`${ev.date}T${ev.time}:00`, ev.durationMinutes ?? 30), timeZone: TIME_ZONE };

  const res = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      summary: ev.title,
      description: ev.description,
      start,
      end,
      ...(ev.recurrence?.length ? { recurrence: ev.recurrence } : {}),
      ...(ev.popupMinutes?.length
        ? { reminders: { useDefault: false, overrides: ev.popupMinutes.map((minutes) => ({ method: "popup", minutes })) } }
        : {}),
    }),
  });

  if (!res.ok) {
    return { success: false as const, status: res.status, message: await res.text() };
  }
  const event = (await res.json()) as { id?: string; htmlLink?: string };
  return { success: true as const, eventId: event.id, link: event.htmlLink };
}

/**
 * Posts an already-built Google event body (summary/start/end/colorId/…) as-is.
 * Used for done-blocks, whose shape is built by lib/done-block.ts rather than
 * from the date/time/duration fields createCalendarEvent takes.
 */
export async function createRawCalendarEvent(token: string, body: Record<string, unknown>) {
  const res = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    return { success: false as const, status: res.status, message: await res.text() };
  }
  const event = (await res.json()) as { id?: string };
  return { success: true as const, eventId: event.id };
}

export interface CalendarEventSummary {
  title: string;
  start: string;
  end?: string;
  allDay: boolean;
  location?: string;
}

export async function listCalendarEvents(
  token: string,
  opts: { timeMin: string; timeMax: string; maxResults?: number },
) {
  const url = new URL(CAL_BASE);
  url.searchParams.set("timeMin", opts.timeMin);
  url.searchParams.set("timeMax", opts.timeMax);
  url.searchParams.set("singleEvents", "true");
  url.searchParams.set("orderBy", "startTime");
  url.searchParams.set("maxResults", String(opts.maxResults ?? 20));

  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    return { success: false as const, status: res.status, message: await res.text() };
  }

  const data = (await res.json()) as {
    items?: Array<{
      summary?: string;
      location?: string;
      start?: { dateTime?: string; date?: string };
      end?: { dateTime?: string; date?: string };
    }>;
  };

  const events: CalendarEventSummary[] = (data.items ?? []).map((it) => ({
    title: it.summary ?? "(untitled)",
    start: it.start?.dateTime ?? it.start?.date ?? "",
    end: it.end?.dateTime ?? it.end?.date,
    allDay: !it.start?.dateTime,
    location: it.location,
  }));

  return { success: true as const, events };
}

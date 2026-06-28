import { connect } from "@vercel/connect/eve";
import type { ToolContext } from "eve/tools";

// Vercel Connect provider for Google Calendar.
//
// App-scoped (non-interactive) so it also works from background runs like the
// morning-digest schedule, which carry the app principal rather than an
// end-user principal. Register the connector once with the Vercel CLI:
//
//   vercel connect create accounts.google.com --name google-calendar
//   vercel connect attach <connector-uid> --yes
//   vercel env pull
//
// Then set GOOGLE_CONNECT_CONNECTOR to the connector UID the CLI prints. Connect
// owns the OAuth consent, encrypted token storage, and refresh — so unlike the
// old static GOOGLE_CALENDAR_ACCESS_TOKEN, the token never silently expires.
export const googleCalendarAuth = connect({
  connector: process.env.GOOGLE_CONNECT_CONNECTOR ?? "google-calendar/cael",
  principalType: "app",
});

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TIME_ZONE = process.env.GOOGLE_CALENDAR_TIMEZONE ?? "America/Toronto";

/**
 * Resolve a Google access token. Prefers a static GOOGLE_CALENDAR_ACCESS_TOKEN
 * (backwards-compatible, easiest for local dev) and otherwise resolves a fresh,
 * auto-refreshed token through Vercel Connect. Returns null when neither is
 * available so callers can degrade gracefully instead of throwing.
 */
export async function resolveGoogleToken(ctx: ToolContext): Promise<string | null> {
  const staticToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (staticToken) return staticToken;
  try {
    const { token } = await ctx.getToken(googleCalendarAuth);
    return token ?? null;
  } catch {
    return null;
  }
}

export const CALENDAR_NOT_CONNECTED =
  "Google Calendar isn't connected yet. Set up the Vercel Connect connector " +
  "(see agent/lib/google-calendar.ts) or set GOOGLE_CALENDAR_ACCESS_TOKEN.";

export interface CalendarEventInput {
  title: string;
  date: string;
  time?: string;
  durationMinutes?: number;
  description?: string;
}

export async function createCalendarEvent(token: string, ev: CalendarEventInput) {
  const isAllDay = !ev.time;
  const start = isAllDay
    ? { date: ev.date }
    : { dateTime: `${ev.date}T${ev.time}:00`, timeZone: TIME_ZONE };
  const end = isAllDay
    ? { date: ev.date }
    : {
        dateTime: new Date(
          new Date(`${ev.date}T${ev.time}:00`).getTime() + (ev.durationMinutes ?? 30) * 60000,
        ).toISOString(),
        timeZone: TIME_ZONE,
      };

  const res = await fetch(CAL_BASE, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ summary: ev.title, description: ev.description, start, end }),
  });

  if (!res.ok) {
    return { success: false as const, status: res.status, message: await res.text() };
  }
  const event = (await res.json()) as { id?: string; htmlLink?: string };
  return { success: true as const, eventId: event.id, link: event.htmlLink };
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

import { TIME_ZONE } from "./now.js";

// Google Calendar auth for a single-user personal app.
//
// Google access tokens expire in ~1 hour, so we don't store one — we store a
// long-lived OAuth *refresh token* and exchange it for a fresh access token on
// demand (cached in-process until just before it expires). This works the same
// in chat and in the morning-digest cron, neither of which has a logged-in
// browser session.
//
// One-time setup (see WORKLOG / the README for the click-by-click version):
//   1. Google Cloud Console: create a project, enable the Google Calendar API.
//   2. Create an OAuth client (Desktop app) and an OAuth consent screen; add
//      yourself as a test user.
//   3. Authorize once (e.g. via the OAuth Playground using your own client id/
//      secret, scope https://www.googleapis.com/auth/calendar) to get a
//      refresh token.
//   4. Set env vars: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN.
//
// GOOGLE_CALENDAR_ACCESS_TOKEN still works as a manual override (handy for a
// quick test), and takes precedence when set.

const CAL_BASE = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

// In-process cache of the last minted access token. Survives across warm
// invocations on Fluid Compute; a cold start just mints a new one.
let cachedToken: { token: string; expiresAt: number } | null = null;

async function mintAccessTokenFromRefresh(): Promise<string | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;

  const now = Date.now();
  if (cachedToken && now < cachedToken.expiresAt - 60_000) return cachedToken.token;

  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    // Don't cache failures; surface as "not connected" to the model.
    return null;
  }

  const data = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!data.access_token) return null;

  cachedToken = {
    token: data.access_token,
    expiresAt: now + (data.expires_in ?? 3600) * 1000,
  };
  return cachedToken.token;
}

/**
 * Resolve a Google access token. Prefers an explicit GOOGLE_CALENDAR_ACCESS_TOKEN
 * override, otherwise mints a fresh, auto-refreshed token from the stored
 * refresh-token credentials. Returns null when nothing is configured so callers
 * degrade gracefully instead of throwing.
 */
export async function resolveGoogleToken(): Promise<string | null> {
  const override = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
  if (override) return override;
  try {
    return await mintAccessTokenFromRefresh();
  } catch {
    return null;
  }
}

export const CALENDAR_NOT_CONNECTED =
  "Google Calendar isn't connected yet. Set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, " +
  "and GOOGLE_REFRESH_TOKEN (see agent/lib/google-calendar.ts for setup).";

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

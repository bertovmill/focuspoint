import { type NextRequest, NextResponse } from "next/server";
import { gcalFetch, GoogleNotConnectedError } from "@/lib/google";

// Proxies the user's primary Google Calendar for the FullCalendar UI.

interface GoogleEvent {
  id: string;
  summary?: string;
  description?: string;
  location?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
}

function toFullCalendarEvent(e: GoogleEvent) {
  const allDay = Boolean(e.start?.date);
  return {
    id: e.id,
    title: e.summary ?? "(no title)",
    start: e.start?.dateTime ?? e.start?.date,
    end: e.end?.dateTime ?? e.end?.date,
    allDay,
    extendedProps: { description: e.description ?? "", location: e.location ?? "" },
  };
}

// Builds the Google start/end payload from FullCalendar-style fields.
// All-day events use date (end exclusive) — same convention FullCalendar uses.
function toGoogleTimes(body: { start: string; end: string; allDay?: boolean }) {
  return body.allDay
    ? { start: { date: body.start.slice(0, 10) }, end: { date: body.end.slice(0, 10) } }
    : { start: { dateTime: body.start }, end: { dateTime: body.end } };
}

function handleError(err: unknown) {
  if (err instanceof GoogleNotConnectedError) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }
  console.error("Calendar API error:", err);
  return NextResponse.json({ error: "calendar_error" }, { status: 500 });
}

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const timeMin = searchParams.get("timeMin");
  const timeMax = searchParams.get("timeMax");
  if (!timeMin || !timeMax) {
    return NextResponse.json({ error: "timeMin and timeMax are required" }, { status: 400 });
  }
  try {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "2500",
    });
    const res = await gcalFetch(`/calendars/primary/events?${params}`);
    if (!res.ok) throw new Error(`Google list events failed: ${res.status} ${await res.text()}`);
    const data = await res.json();
    return NextResponse.json((data.items as GoogleEvent[]).map(toFullCalendarEvent));
  } catch (err) {
    return handleError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (!body.title || !body.start || !body.end) {
      return NextResponse.json({ error: "title, start and end are required" }, { status: 400 });
    }
    const event = {
      summary: body.title,
      ...(body.description ? { description: body.description } : {}),
      ...(body.location ? { location: body.location } : {}),
      ...toGoogleTimes(body),
    };
    const res = await gcalFetch(`/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify(event),
    });
    if (!res.ok) throw new Error(`Google create event failed: ${res.status} ${await res.text()}`);
    return NextResponse.json(toFullCalendarEvent(await res.json()), { status: 201 });
  } catch (err) {
    return handleError(err);
  }
}

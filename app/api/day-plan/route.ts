import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";
import { gcalFetch, GoogleNotConnectedError } from "@/lib/google";
import { getPrinciples } from "@/lib/principles";
import { getHabitTicks, setHabitTick } from "@/lib/habits";
import { dayKey, STREAK_TIME_ZONE } from "@/lib/streak";
import { DEFAULT_HABITS_MARKDOWN, parseDailyHabits, planDay, type Busy } from "@/lib/day-plan";

// The Today timeline on Home: the Principles doc's "Daily habits" slotted around
// today's calendar (lib/day-plan.ts), with each habit's tick. Read-only against
// Google — the plan is never written to the calendar.

export const dynamic = "force-dynamic";

interface GoogleEvent {
  summary?: string;
  status?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
}

type CalendarState = "ok" | "not_connected" | "error";

/** An instant → its local day key and minutes since local midnight. */
function localParts(d: Date): { day: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: STREAK_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { day: dayKey(d), minutes: get("hour") * 60 + get("minute") };
}

/** Today's timed, busy events, clipped to today, in local minutes. */
async function todaysEvents(today: string): Promise<{ events: (Busy & { title: string })[]; calendar: CalendarState }> {
  try {
    // A 36-hour window either side covers any timezone; the day filter below is exact.
    const now = Date.now();
    const params = new URLSearchParams({
      timeMin: new Date(now - 36 * 3600_000).toISOString(),
      timeMax: new Date(now + 36 * 3600_000).toISOString(),
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: "250",
    });
    const res = await gcalFetch(`/calendars/primary/events?${params}`);
    if (!res.ok) throw new Error(`Google list events failed: ${res.status}`);
    const items = ((await res.json()).items ?? []) as GoogleEvent[];

    const events = items.flatMap((e) => {
      if (!e.start?.dateTime || !e.end?.dateTime) return []; // all-day events don't block time
      if (e.status === "cancelled" || e.transparency === "transparent") return [];
      if (e.attendees?.some((a) => a.self && a.responseStatus === "declined")) return [];
      const s = localParts(new Date(e.start.dateTime));
      const en = localParts(new Date(e.end.dateTime));
      if (s.day > today || en.day < today) return [];
      const start = s.day < today ? 0 : s.minutes;
      const end = en.day > today ? 24 * 60 : en.minutes;
      return end > start ? [{ title: e.summary ?? "(busy)", start, end }] : [];
    });
    return { events, calendar: "ok" };
  } catch (err) {
    if (err instanceof GoogleNotConnectedError) return { events: [], calendar: "not_connected" };
    console.error("day-plan calendar read failed:", err);
    return { events: [], calendar: "error" };
  }
}

export async function GET() {
  try {
    const today = dayKey(new Date());
    const [doc, { events, calendar }] = await Promise.all([getPrinciples(), todaysEvents(today)]);

    const fromDoc = parseDailyHabits(doc.content);
    const habits = fromDoc ?? parseDailyHabits(DEFAULT_HABITS_MARKDOWN)!;
    const plan = planDay(habits, events);
    const ticks = await getHabitTicks(getDb(), plan.map((p) => p.key), today);

    return NextResponse.json({
      date: today,
      now: localParts(new Date()).minutes,
      source: fromDoc ? "doc" : "defaults",
      calendar,
      events,
      habits: plan.map((p) => ({ ...p, done: ticks[p.key]?.done ?? false, auto: ticks[p.key]?.auto ?? false })),
    });
  } catch (err) {
    console.error("day-plan failed:", err);
    return NextResponse.json({ error: "Failed to plan the day" }, { status: 500 });
  }
}

// PATCH { key, done } — tick a habit on today's timeline.
export async function PATCH(req: Request) {
  try {
    const { key, done } = (await req.json()) as { key?: unknown; done?: unknown };
    if (typeof key !== "string" || !key || typeof done !== "boolean") {
      return NextResponse.json({ error: "key and done are required" }, { status: 400 });
    }
    // ensureSchema walks every table and takes seconds, so only when the first
    // tick finds habit_checks missing.
    await setHabitTick(getDb(), key, done).catch(async () => {
      await ensureSchema();
      await setHabitTick(getDb(), key, done);
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("day-plan tick failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

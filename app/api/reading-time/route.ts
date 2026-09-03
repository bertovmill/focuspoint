import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getReadingDay, recordReadingSession, setReadingDay, MAX_READING_SESSION_MINUTES } from "@/lib/reading-time";
import { dayKey } from "@/lib/scorecard";

// Today's reading-time total, and the endpoint the timer posts a finished session to.

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    return NextResponse.json(await getReadingDay(getDb(), date ?? undefined));
  } catch {
    // Includes "relation reading_days does not exist" before the first session.
    return NextResponse.json({ date: dayKey(new Date()), minutes: 0, sessions: 0 });
  }
}

/**
 * Log a finished session. `seconds` adds to the day (the timer's path); `minutes`
 * replaces it (a correction typed on the card). The write path is the one that
 * creates the table, so the first session of all still lands.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { seconds?: unknown; minutes?: unknown; date?: unknown };
    const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : undefined;
    const sql = getDb();

    const run = async () => {
      if (typeof body.minutes === "number" && Number.isFinite(body.minutes)) {
        return setReadingDay(sql, date ?? dayKey(new Date()), body.minutes);
      }
      const seconds = Number(body.seconds);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("seconds or minutes required");
      return recordReadingSession(sql, Math.min(seconds, MAX_READING_SESSION_MINUTES * 60), date);
    };

    try {
      return NextResponse.json(await run());
    } catch (err) {
      if (!/does not exist/i.test(String(err))) throw err;
      await ensureSchema();
      return NextResponse.json(await run());
    }
  } catch (err) {
    console.error("reading time write failed:", err);
    return NextResponse.json({ error: "Failed to log the session" }, { status: 500 });
  }
}

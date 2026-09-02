import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { getDay, recordSession, setDay, MAX_SESSION_MINUTES } from "@/lib/meditation";
import { dayKey } from "@/lib/scorecard";

// Today's meditation total, and the endpoint the timer posts a finished sit to.

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    return NextResponse.json(await getDay(getDb(), date ?? undefined));
  } catch {
    // Includes "relation meditation_days does not exist" before the first sit.
    return NextResponse.json({ date: dayKey(new Date()), minutes: 0, sessions: 0 });
  }
}

/**
 * Log a finished session. `seconds` adds to the day (the timer's path); `minutes`
 * replaces it (a correction typed on the card). The write path is the one that
 * creates the table, so the first sit of all still lands.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { seconds?: unknown; minutes?: unknown; date?: unknown };
    const date = typeof body.date === "string" && DATE_RE.test(body.date) ? body.date : undefined;
    const sql = getDb();

    const run = async () => {
      if (typeof body.minutes === "number" && Number.isFinite(body.minutes)) {
        return setDay(sql, date ?? dayKey(new Date()), body.minutes);
      }
      const seconds = Number(body.seconds);
      if (!Number.isFinite(seconds) || seconds < 0) throw new Error("seconds or minutes required");
      return recordSession(sql, Math.min(seconds, MAX_SESSION_MINUTES * 60), date);
    };

    try {
      return NextResponse.json(await run());
    } catch (err) {
      if (!/does not exist/i.test(String(err))) throw err;
      await ensureSchema();
      return NextResponse.json(await run());
    }
  } catch (err) {
    console.error("meditation write failed:", err);
    return NextResponse.json({ error: "Failed to log the sit" }, { status: 500 });
  }
}

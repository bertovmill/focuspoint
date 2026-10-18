import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { dayKey, getKeystrokeSummary, recordKeystrokes } from "@/lib/keystrokes";

// Keystrokes-per-day — see lib/keystrokes.ts. GET is for the dashboard card (guarded by
// the session gate in middleware.ts). POST is the local counter reporting the day's running
// total, authenticated with a bearer KEYSTROKE_TOKEN that middleware also allow-lists.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getKeystrokeSummary(getDb()));
  } catch (err) {
    console.error("keystrokes read failed:", err);
    return NextResponse.json({ error: "Failed to load keystrokes" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  // Middleware already checked the bearer token against KEYSTROKE_TOKEN, but re-verify
  // here so the route is never reachable unauthenticated even if the matcher changes.
  const token = process.env.KEYSTROKE_TOKEN;
  if (!token || req.headers.get("authorization") !== `Bearer ${token}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const count = Math.trunc(Number(body.count));
    if (!Number.isFinite(count) || count < 0) {
      return NextResponse.json({ error: "count must be a non-negative number" }, { status: 400 });
    }
    // The agent stamps the day in Berto's timezone before sending; fall back to server-side
    // if it didn't, so a POST is never silently misfiled.
    const date = typeof body.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.date) ? body.date : dayKey(new Date());

    const sql = getDb();
    await recordKeystrokes(sql, date, count);
    return NextResponse.json(await getKeystrokeSummary(sql));
  } catch (err) {
    console.error("keystrokes write failed:", err);
    return NextResponse.json({ error: "Failed to save" }, { status: 500 });
  }
}

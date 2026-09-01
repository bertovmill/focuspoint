import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The hand-written journal page for one day. `?date=YYYY-MM-DD` (local date,
 * passed by the client so the server's timezone can't shift the day), defaulting
 * to today. A missing row is returned as empty content rather than a 404 — the
 * editor treats "never written" and "written then cleared" the same way.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const entryDate = date ?? todayISO();
    // No ensureSchema() on the read path — it walks every CREATE TABLE in lib/db.ts
    // and cost seconds on a home-page load. The write path creates the table, and a
    // read before the first write just falls through to the empty document below.
    const sql = getDb();
    const [row] = await sql`
      SELECT entry_date, content, updated_at
      FROM daily_journal
      WHERE entry_date = ${entryDate}
    `;
    return NextResponse.json(
      row
        ? { entry_date: entryDate, content: row.content, updated_at: row.updated_at }
        : { entry_date: entryDate, content: "", updated_at: null },
    );
  } catch {
    // Includes "relation daily_journal does not exist" before the first save.
    return NextResponse.json({ entry_date: null, content: "", updated_at: null });
  }
}

/** Upsert the whole day's document. The editor autosaves, so this is called often. */
export async function PUT(req: Request) {
  try {
    const { date, content } = await req.json();
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content required" }, { status: 400 });
    }
    const entryDate = date ?? todayISO();
    const sql = getDb();
    const upsert = () => sql`
      INSERT INTO daily_journal (entry_date, content)
      VALUES (${entryDate}, ${content})
      ON CONFLICT (entry_date)
      DO UPDATE SET content = EXCLUDED.content, updated_at = NOW()
      RETURNING entry_date, content, updated_at
    `;
    // The editor autosaves every keystroke-pause, so the happy path must not pay
    // for ensureSchema() (it re-runs every CREATE TABLE in lib/db.ts). Create the
    // table only when the write actually fails for want of it.
    let row;
    try {
      [row] = await upsert();
    } catch {
      await ensureSchema();
      [row] = await upsert();
    }
    // Echo back the date we were asked for: the driver hands DATE columns back as
    // a JS Date, and re-serialising that is a needless chance to shift a day.
    return NextResponse.json({
      entry_date: entryDate,
      content: row.content,
      updated_at: row.updated_at,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save journal" }, { status: 500 });
  }
}

/**
 * Same upsert as PUT. Exists because `navigator.sendBeacon` — the only save that
 * survives the tab closing — can only issue a POST.
 */
export const POST = PUT;

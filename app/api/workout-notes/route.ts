import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { todayISO } from "@/lib/nutrition";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The driver hands DATE columns back as a JS Date; re-serialising that through
 *  toISOString() would shift the day in any timezone west of UTC. */
function toISODate(value: unknown): string {
  if (value instanceof Date) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(
      value.getDate(),
    ).padStart(2, "0")}`;
  }
  return String(value).slice(0, 10);
}

/**
 * The training log: one plain-text note per day. `?date=YYYY-MM-DD` returns that
 * single day (empty note if never written — the editor treats "never written" and
 * "written then cleared" the same way); without a date it returns the most recent
 * `limit` days that actually have a note, newest first, for the history list.
 */
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date");
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    const sql = getDb();

    if (date) {
      // No ensureSchema() on the read path — it walks every CREATE TABLE in
      // lib/db.ts and costs seconds on a home-page load. The write path creates
      // the table; a read before the first write falls through to empty below.
      const [row] = await sql`
        SELECT logged_date, note, updated_at
        FROM workout_notes
        WHERE logged_date = ${date}
      `;
      return NextResponse.json(
        row
          ? { logged_date: date, note: row.note, updated_at: row.updated_at }
          : { logged_date: date, note: "", updated_at: null },
      );
    }

    const limitParam = Number(searchParams.get("limit"));
    const limit = Number.isFinite(limitParam) ? Math.min(Math.max(limitParam, 1), 365) : 60;
    const rows = await sql`
      SELECT logged_date, note, updated_at
      FROM workout_notes
      WHERE note <> ''
      ORDER BY logged_date DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(
      rows.map((r) => ({
        logged_date: toISODate(r.logged_date),
        note: r.note,
        updated_at: r.updated_at,
      })),
    );
  } catch {
    // Includes "relation workout_notes does not exist" before the first save.
    const { searchParams } = new URL(req.url);
    return searchParams.get("date")
      ? NextResponse.json({ logged_date: searchParams.get("date"), note: "", updated_at: null })
      : NextResponse.json([]);
  }
}

/**
 * Upsert one day's note. The card autosaves, so this is called often. An emptied
 * note deletes the row rather than storing '' — that keeps the history list from
 * growing blank entries for days that were opened and not written.
 */
export async function PUT(req: Request) {
  try {
    const { date, note } = await req.json();
    if (date && !DATE_RE.test(date)) {
      return NextResponse.json({ error: "Invalid date" }, { status: 400 });
    }
    if (typeof note !== "string") {
      return NextResponse.json({ error: "note required" }, { status: 400 });
    }
    const loggedDate = date ?? todayISO();
    const trimmed = note.trim();
    const sql = getDb();

    const write = () =>
      trimmed === ""
        ? sql`DELETE FROM workout_notes WHERE logged_date = ${loggedDate}`
        : sql`
            INSERT INTO workout_notes (logged_date, note)
            VALUES (${loggedDate}, ${note})
            ON CONFLICT (logged_date)
            DO UPDATE SET note = EXCLUDED.note, updated_at = NOW()
            RETURNING logged_date, note, updated_at
          `;

    // The card autosaves on a keystroke pause, so the happy path must not pay for
    // ensureSchema() (it re-runs every CREATE TABLE in lib/db.ts). Create the table
    // only when the write actually fails for want of it.
    let rows;
    try {
      rows = await write();
    } catch {
      await ensureSchema();
      rows = await write();
    }

    return NextResponse.json({
      logged_date: loggedDate,
      note: trimmed === "" ? "" : rows[0].note,
      updated_at: trimmed === "" ? null : rows[0].updated_at,
    });
  } catch {
    return NextResponse.json({ error: "Failed to save workout note" }, { status: 500 });
  }
}

/** Same upsert as PUT. Exists because `navigator.sendBeacon` — the only save that
 *  survives the tab closing — can only issue a POST. */
export const POST = PUT;

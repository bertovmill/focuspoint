import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { parseClippings } from "@/lib/kindle-clippings";
import { incrementNotesWritten } from "@/lib/scorecard";

// Import Kindle's `My Clippings.txt` — pasted or uploaded raw text. Inserts only the
// notes not already stored (unique on book+note+date), so re-pasting the whole file
// after adding a few new ones is safe and cheap.

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { text?: unknown };
    if (typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const clippings = parseClippings(body.text);
    if (clippings.length === 0) {
      return NextResponse.json({ imported: 0, byDate: {} });
    }

    const sql = getDb();

    const insert = async () => {
      const inserted: { date: string }[] = [];
      for (const c of clippings) {
        const rows = await sql`
          INSERT INTO reading_notes (book_title, note, location, note_date)
          VALUES (${c.bookTitle}, ${c.note}, ${c.location}, ${c.date}::date)
          ON CONFLICT (book_title, note, note_date) DO NOTHING
          RETURNING to_char(note_date, 'YYYY-MM-DD') AS date
        `;
        if (rows[0]) inserted.push({ date: String(rows[0].date) });
      }
      return inserted;
    };

    let inserted: { date: string }[];
    try {
      inserted = await insert();
    } catch (err) {
      if (!/does not exist/i.test(String(err))) throw err;
      await ensureSchema();
      inserted = await insert();
    }

    const byDate = new Map<string, number>();
    for (const { date } of inserted) byDate.set(date, (byDate.get(date) ?? 0) + 1);
    for (const [date, count] of byDate) await incrementNotesWritten(sql, date, count);

    return NextResponse.json({ imported: inserted.length, byDate: Object.fromEntries(byDate) });
  } catch (err) {
    console.error("reading notes import failed:", err);
    return NextResponse.json({ error: "Failed to import notes" }, { status: 500 });
  }
}

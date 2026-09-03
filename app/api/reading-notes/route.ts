import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { parseClippings } from "@/lib/kindle-clippings";

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
      return NextResponse.json({ imported: 0 });
    }

    const sql = getDb();

    const insert = async () => {
      let count = 0;
      for (const c of clippings) {
        const rows = await sql`
          INSERT INTO reading_notes (book_title, note, location, note_date)
          VALUES (${c.bookTitle}, ${c.note}, ${c.location}, ${c.date}::date)
          ON CONFLICT (book_title, note, note_date) DO NOTHING
          RETURNING id
        `;
        if (rows[0]) count += 1;
      }
      return count;
    };

    let imported: number;
    try {
      imported = await insert();
    } catch (err) {
      if (!/does not exist/i.test(String(err))) throw err;
      await ensureSchema();
      imported = await insert();
    }

    return NextResponse.json({ imported });
  } catch (err) {
    console.error("reading notes import failed:", err);
    return NextResponse.json({ error: "Failed to import notes" }, { status: 500 });
  }
}

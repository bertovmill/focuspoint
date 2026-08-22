import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { normalizeRules } from "@/lib/nutrition";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const days = Math.min(Number(searchParams.get("days") ?? 120), 400);
    const sql = getDb();
    const rows = await sql`
      SELECT logged_date, rules, note, updated_at
      FROM nutrition_days
      WHERE logged_date >= CURRENT_DATE - ${days}::int
      ORDER BY logged_date DESC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

// Upsert a day's protocol rules. Sending the full set every time keeps the
// client simple — checking a box PUTs the new array, there is no partial merge.
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const rules = normalizeRules(body.rules);
    const date = body.logged_date?.trim() || new Date().toISOString().slice(0, 10);
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_days (logged_date, rules, note, updated_at)
      VALUES (${date}, ${rules}, ${body.note?.trim() || null}, NOW())
      ON CONFLICT (logged_date) DO UPDATE
        SET rules = EXCLUDED.rules,
            note = COALESCE(EXCLUDED.note, nutrition_days.note),
            updated_at = NOW()
      RETURNING logged_date, rules, note, updated_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to save day" }, { status: 500 });
  }
}

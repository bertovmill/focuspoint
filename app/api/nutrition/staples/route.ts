import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, why, sort_order, created_at
      FROM nutrition_staples
      ORDER BY sort_order ASC, created_at ASC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, why } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_staples (name, why)
      VALUES (${name.trim()}, ${why?.trim() || null})
      ON CONFLICT (name) DO UPDATE SET why = COALESCE(EXCLUDED.why, nutrition_staples.why)
      RETURNING id, name, why, sort_order, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to add staple" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT
        l.id,
        l.name,
        l.created_at,
        COUNT(i.id) FILTER (WHERE i.completed = FALSE) AS open_count,
        COUNT(i.id) AS item_count
      FROM lists l
      LEFT JOIN list_items i ON i.list_id = l.id
      GROUP BY l.id
      ORDER BY l.created_at ASC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO lists (name)
      VALUES (${name.trim()})
      RETURNING id, name, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create list" }, { status: 500 });
  }
}

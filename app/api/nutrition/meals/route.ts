import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 120), 500);
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, notes, felt_good, eaten_date, created_at
      FROM nutrition_meals
      ORDER BY eaten_date DESC, created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, notes, felt_good, eaten_date } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_meals (name, notes, felt_good, eaten_date)
      VALUES (
        ${name.trim()},
        ${notes?.trim() || null},
        ${felt_good === false ? false : true},
        ${eaten_date?.trim() || new Date().toISOString().slice(0, 10)}
      )
      RETURNING id, name, notes, felt_good, eaten_date, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to log meal" }, { status: 500 });
  }
}

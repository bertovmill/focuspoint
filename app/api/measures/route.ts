import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const category = searchParams.get("category");
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 500);
    const sql = getDb();
    const rows = category
      ? await sql`
          SELECT id, category, recorded_date, data, notes, created_at
          FROM measures
          WHERE category = ${category}
          ORDER BY recorded_date DESC, created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, category, recorded_date, data, notes, created_at
          FROM measures
          ORDER BY recorded_date DESC, created_at DESC
          LIMIT ${limit}
        `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { category, recorded_date, data = {}, notes } = await req.json();
    if (!category?.trim()) return NextResponse.json({ error: "category required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO measures (category, recorded_date, data, notes)
      VALUES (${category.trim()}, ${recorded_date ?? new Date().toISOString().slice(0, 10)}, ${JSON.stringify(data)}, ${notes ?? null})
      RETURNING id, category, recorded_date, data, notes, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create measure" }, { status: 500 });
  }
}

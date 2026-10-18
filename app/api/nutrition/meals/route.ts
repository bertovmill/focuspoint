import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 120), 500);
    const sql = getDb();
    // ?from=&to= — one week's logs, for the ticks on the /meals grid
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to && ISO.test(from) && ISO.test(to)) {
      const rows = await sql`
        SELECT id, name, notes, felt_good, slot, to_char(eaten_date, 'YYYY-MM-DD') AS eaten_date, created_at, protein_g, kcal
        FROM nutrition_meals
        WHERE eaten_date BETWEEN ${from} AND ${to}
        ORDER BY eaten_date ASC, created_at ASC
      `;
      return NextResponse.json(rows);
    }
    const rows = await sql`
      SELECT id, name, notes, felt_good, slot, eaten_date, created_at, protein_g, kcal
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
    const { name, notes, felt_good, slot, eaten_date, protein_g, kcal } = await req.json();
    const protein = protein_g === undefined || protein_g === null || protein_g === "" ? null : Number(protein_g);
    const calories = kcal === undefined || kcal === null || kcal === "" ? null : Math.round(Number(kcal));
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_meals (name, notes, felt_good, slot, eaten_date, protein_g, kcal)
      VALUES (
        ${name.trim()},
        ${notes?.trim() || null},
        ${felt_good === false ? false : true},
        ${slot?.trim() || null},
        ${eaten_date?.trim() || new Date().toISOString().slice(0, 10)},
        ${Number.isFinite(protein) ? protein : null},
        ${Number.isFinite(calories) ? calories : null}
      )
      RETURNING id, name, notes, felt_good, slot, eaten_date, created_at, protein_g, kcal
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to log meal" }, { status: 500 });
  }
}

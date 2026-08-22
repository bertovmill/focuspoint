import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE nutrition_meals
      SET
        name = COALESCE(${body.name?.trim() || null}, name),
        notes = CASE WHEN ${"notes" in body} THEN ${body.notes?.trim() || null} ELSE notes END,
        felt_good = COALESCE(${typeof body.felt_good === "boolean" ? body.felt_good : null}, felt_good)
      WHERE id = ${id}
      RETURNING id, name, notes, felt_good, eaten_date, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update meal" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM nutrition_meals WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

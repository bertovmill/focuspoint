import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM measures WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { recorded_date, data, notes } = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE measures
      SET
        recorded_date = COALESCE(${recorded_date ?? null}, recorded_date),
        data = COALESCE(${data ? JSON.stringify(data) : null}, data),
        notes = COALESCE(${notes ?? null}, notes)
      WHERE id = ${id}
      RETURNING id, category, recorded_date, data, notes, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update measure" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title, image_data } = await req.json();
    if (!title?.trim() && !image_data) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE sketches SET
        title = COALESCE(${title?.trim() || null}, title),
        image_data = COALESCE(${image_data || null}, image_data),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, image_data, created_at, updated_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update sketch" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM sketches WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

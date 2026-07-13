import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    const [list] = await sql`SELECT id, name, created_at FROM lists WHERE id = ${id}`;
    if (!list) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const items = await sql`
      SELECT id, list_id, title, completed, created_at, completed_at
      FROM list_items
      WHERE list_id = ${id}
      ORDER BY completed ASC, created_at DESC
    `;
    return NextResponse.json({ ...list, items });
  } catch {
    return NextResponse.json({ error: "Failed to load list" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      UPDATE lists SET name = ${name.trim()} WHERE id = ${id}
      RETURNING id, name, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update list" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM lists WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { itemId } = await params;
    const { title, completed } = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE list_items
      SET
        title = COALESCE(${title ?? null}, title),
        completed = COALESCE(${completed ?? null}, completed),
        completed_at = CASE WHEN ${completed ?? null} = TRUE THEN NOW() WHEN ${completed ?? null} = FALSE THEN NULL ELSE completed_at END
      WHERE id = ${itemId}
      RETURNING id, list_id, title, completed, created_at, completed_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update item" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  try {
    const { itemId } = await params;
    const sql = getDb();
    await sql`DELETE FROM list_items WHERE id = ${itemId}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

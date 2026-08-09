import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title, description, image_url, memory_date } = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE memories
      SET
        title = ${title?.trim() || null},
        description = ${description?.trim() || null},
        image_url = ${image_url?.trim() || null},
        memory_date = ${memory_date?.trim() || new Date().toISOString().slice(0, 10)}
      WHERE id = ${id}
      RETURNING id, title, description, image_url, memory_date, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update memory" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM memories WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

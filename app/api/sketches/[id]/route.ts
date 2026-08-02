import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Full record including the scene — used when opening a sketch for editing.
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    const [row] = await sql`
      SELECT id, title, image_data, scene, created_at, updated_at
      FROM sketches WHERE id = ${id}
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to load sketch" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title, image_data, scene } = await req.json();
    if (!title?.trim() && !image_data && !scene) {
      return NextResponse.json({ error: "nothing to update" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE sketches SET
        title = COALESCE(${title?.trim() || null}, title),
        image_data = COALESCE(${image_data || null}, image_data),
        scene = COALESCE(${scene ? JSON.stringify(scene) : null}::jsonb, scene),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, image_data, created_at, updated_at, (scene IS NOT NULL) AS has_scene
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

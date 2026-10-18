import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM vision_items WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title, content, image_url, horizon, achieved } = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE vision_items
      SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        image_url = COALESCE(${image_url ?? null}, image_url),
        horizon = COALESCE(${horizon ?? null}, horizon),
        achieved = COALESCE(${achieved ?? null}, achieved),
        achieved_at = CASE
          WHEN ${achieved ?? null}::boolean IS NULL THEN achieved_at
          WHEN ${achieved ?? null}::boolean THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, kind, title, content, image_url, horizon, achieved, achieved_at, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update vision item" }, { status: 500 });
  }
}

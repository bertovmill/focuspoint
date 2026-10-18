import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// The gallery only needs thumbnails; scenes are large, so they're fetched per-sketch on open.
// GET → every sketch, newest first. `?meta=1` leaves out image_data (a PNG per
// row) for callers that only need titles, like the command palette.
export async function GET(req: Request) {
  try {
    const sql = getDb();
    const meta = new URL(req.url).searchParams.get("meta") === "1";
    const rows = meta
      ? await sql`
          SELECT id, title, created_at, updated_at, (scene IS NOT NULL) AS has_scene
          FROM sketches
          ORDER BY updated_at DESC
        `
      : await sql`
          SELECT id, title, image_data, created_at, updated_at, (scene IS NOT NULL) AS has_scene
          FROM sketches
          ORDER BY updated_at DESC
        `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, image_data, scene } = await req.json();
    if (!image_data?.startsWith("data:image/")) {
      return NextResponse.json({ error: "image_data required" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO sketches (title, image_data, scene)
      VALUES (${title?.trim() || "Untitled"}, ${image_data}, ${scene ? JSON.stringify(scene) : null})
      RETURNING id, title, image_data, created_at, updated_at, (scene IS NOT NULL) AS has_scene
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to save sketch" }, { status: 500 });
  }
}

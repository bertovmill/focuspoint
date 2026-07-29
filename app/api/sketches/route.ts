import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, image_data, created_at, updated_at
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
    const { title, image_data } = await req.json();
    if (!image_data?.startsWith("data:image/")) {
      return NextResponse.json({ error: "image_data required" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO sketches (title, image_data)
      VALUES (${title?.trim() || "Untitled"}, ${image_data})
      RETURNING id, title, image_data, created_at, updated_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to save sketch" }, { status: 500 });
  }
}

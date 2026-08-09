import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, description, image_url, created_at
      FROM memories
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, description, image_url } = await req.json();
    if (!image_url?.trim()) return NextResponse.json({ error: "image_url required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO memories (title, description, image_url)
      VALUES (${title?.trim() || null}, ${description?.trim() || null}, ${image_url.trim()})
      RETURNING id, title, description, image_url, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create memory" }, { status: 500 });
  }
}

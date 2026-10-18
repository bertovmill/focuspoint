import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, note, image_url, thanked_date, created_at
      FROM thank_yous
      ORDER BY thanked_date DESC, created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, note, image_url, thanked_date } = await req.json();
    if (!image_url?.trim() && !title?.trim() && !note?.trim()) {
      return NextResponse.json({ error: "A thank-you needs a photo, title, or note" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thank_yous (title, note, image_url, thanked_date)
      VALUES (
        ${title?.trim() || null},
        ${note?.trim() || null},
        ${image_url?.trim() || null},
        ${thanked_date?.trim() || new Date().toISOString().slice(0, 10)}
      )
      RETURNING id, title, note, image_url, thanked_date, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create thank-you" }, { status: 500 });
  }
}

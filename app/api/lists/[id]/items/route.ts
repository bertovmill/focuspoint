import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO list_items (list_id, title)
      VALUES (${id}, ${title.trim()})
      RETURNING id, list_id, title, completed, created_at, completed_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create item" }, { status: 500 });
  }
}

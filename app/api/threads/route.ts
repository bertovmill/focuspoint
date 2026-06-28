import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const sql = getDb();
  const rows = await sql`
    SELECT id, title, session, events, created_at, updated_at
    FROM threads
    ORDER BY updated_at DESC
  `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { id, title = "" } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO threads (id, title)
    VALUES (${id}, ${title})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id, title, session, events, created_at, updated_at
  `;
  return NextResponse.json(row);
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, completed, priority, due_date, created_at
      FROM todos
      WHERE completed = FALSE
      ORDER BY priority DESC, created_at DESC
      LIMIT 50
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, priority = "normal", due_date } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date)
      VALUES (${title.trim()}, ${priority}, ${due_date ?? null})
      RETURNING id, title, completed, priority, due_date, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

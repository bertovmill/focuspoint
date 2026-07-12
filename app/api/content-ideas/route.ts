import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeCompleted = searchParams.get("include_completed") === "true";
    const limit = Math.min(Number(searchParams.get("limit") ?? 100), 200);
    const sql = getDb();
    const rows = includeCompleted
      ? await sql`
          SELECT id, title, completed, created_at, completed_at
          FROM content_ideas
          ORDER BY completed ASC, created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, title, completed, created_at, completed_at
          FROM content_ideas
          WHERE completed = FALSE
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
    const { title } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO content_ideas (title)
      VALUES (${title.trim()})
      RETURNING id, title, completed, created_at, completed_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create content idea" }, { status: 500 });
  }
}

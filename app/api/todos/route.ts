import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeCompleted = searchParams.get("include_completed");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const sql = getDb();
    const rows =
      includeCompleted === "true"
        ? await sql`
            SELECT id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
            FROM todos
            ORDER BY completed ASC, in_progress DESC, priority DESC, created_at DESC
            LIMIT ${limit}
          `
        : includeCompleted === "today"
          ? await sql`
              SELECT id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
              FROM todos
              WHERE completed = FALSE OR completed_at::date = CURRENT_DATE
              ORDER BY completed ASC, in_progress DESC, priority DESC, created_at DESC
              LIMIT ${limit}
            `
          : await sql`
              SELECT id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
              FROM todos
              WHERE completed = FALSE
              ORDER BY in_progress DESC, priority DESC, created_at DESC
              LIMIT ${limit}
            `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, priority = "normal", due_date, recurrence = "none" } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date, recurrence)
      VALUES (${title.trim()}, ${priority}, ${due_date ?? null}, ${recurrence})
      RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

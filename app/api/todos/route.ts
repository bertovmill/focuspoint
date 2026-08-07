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
            SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
            FROM todos
            ORDER BY completed ASC, in_progress DESC, waiting DESC, priority DESC, created_at DESC
            LIMIT ${limit}
          `
        : includeCompleted === "today"
          ? await sql`
              SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
              FROM todos
              WHERE completed = FALSE OR completed_at::date = CURRENT_DATE
              ORDER BY completed ASC, in_progress DESC, waiting DESC, priority DESC, created_at DESC
              LIMIT ${limit}
            `
          : await sql`
              SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
              FROM todos
              WHERE completed = FALSE
              ORDER BY in_progress DESC, waiting DESC, priority DESC, created_at DESC
              LIMIT ${limit}
            `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, priority = "normal", due_date, recurrence = "none", estimated_minutes } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const parsedEstimate = Number(estimated_minutes);
    if (!Number.isFinite(parsedEstimate) || parsedEstimate <= 0) {
      return NextResponse.json({ error: "estimated_minutes required" }, { status: 400 });
    }
    const estimate = Math.trunc(parsedEstimate);
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes)
      VALUES (${title.trim()}, ${priority}, ${due_date ?? null}, ${recurrence}, ${estimate})
      RETURNING id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

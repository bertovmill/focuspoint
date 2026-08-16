import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { hasWorkingSlot } from "@/lib/working-now";
import { isLaneCategory, normalizeCategory } from "@/lib/task-categories";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const includeCompleted = searchParams.get("include_completed");
    const limit = Math.min(Number(searchParams.get("limit") ?? 50), 200);
    const sql = getDb();
    const rows =
      includeCompleted === "true"
        ? await sql`
            SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id
            FROM todos
            ORDER BY completed ASC, in_progress DESC, waiting DESC, priority DESC, created_at DESC
            LIMIT ${limit}
          `
        : includeCompleted === "today"
          ? await sql`
              SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id
              FROM todos
              WHERE completed = FALSE OR completed_at::date = CURRENT_DATE
              ORDER BY completed ASC, in_progress DESC, waiting DESC, priority DESC, created_at DESC
              LIMIT ${limit}
            `
          : await sql`
              SELECT id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id
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
    const { title, priority = "normal", due_date, recurrence = "none", estimated_minutes, in_progress = false, category, parent_id } = await req.json();
    if (!title?.trim()) return NextResponse.json({ error: "title required" }, { status: 400 });
    const normalizedCategory = normalizeCategory(category);
    const parsedParent = Number(parent_id);
    const parent = Number.isFinite(parsedParent) && parsedParent > 0 ? Math.trunc(parsedParent) : null;
    // A pipeline *piece* (Content, Code, Community, Sales) is a container, not a unit
    // of work — it has no estimate and nothing to time. Every other task still has to
    // declare how long it'll take.
    const isPiece = parent === null && isLaneCategory(normalizedCategory);
    const parsedEstimate = Number(estimated_minutes);
    const hasEstimate = Number.isFinite(parsedEstimate) && parsedEstimate > 0;
    if (!hasEstimate && !isPiece) {
      return NextResponse.json({ error: "estimated_minutes required" }, { status: 400 });
    }
    const estimate = hasEstimate ? Math.trunc(parsedEstimate) : null;
    // A new task can only land in "working on now" if there's a free slot.
    const startWorking = Boolean(in_progress) && (await hasWorkingSlot(getDb()));
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO todos (title, priority, due_date, recurrence, estimated_minutes, in_progress, category, parent_id)
      VALUES (${title.trim()}, ${priority}, ${due_date ?? null}, ${recurrence}, ${estimate}, ${startWorking}, ${normalizedCategory}, ${parent})
      RETURNING id, title, completed, in_progress, waiting, priority, due_date, recurrence, created_at, completed_at, timer_started_at, time_spent_seconds, task_number, estimated_minutes, category, canvas_x, canvas_y, parent_id
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create todo" }, { status: 500 });
  }
}

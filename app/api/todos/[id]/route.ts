import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM todos WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { title, priority, recurrence } = body;
    const hasDueDate = Object.prototype.hasOwnProperty.call(body, "due_date");
    const due_date = hasDueDate ? body.due_date : undefined;
    const sql = getDb();
    const [row] = hasDueDate
      ? await sql`
          UPDATE todos
          SET
            title = COALESCE(${title ?? null}, title),
            priority = COALESCE(${priority ?? null}, priority),
            due_date = ${due_date ?? null},
            recurrence = COALESCE(${recurrence ?? null}, recurrence)
          WHERE id = ${id}
          RETURNING id, title, completed, priority, due_date, recurrence, created_at, completed_at
        `
      : await sql`
          UPDATE todos
          SET
            title = COALESCE(${title ?? null}, title),
            priority = COALESCE(${priority ?? null}, priority),
            recurrence = COALESCE(${recurrence ?? null}, recurrence)
          WHERE id = ${id}
          RETURNING id, title, completed, priority, due_date, recurrence, created_at, completed_at
        `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update todo" }, { status: 500 });
  }
}

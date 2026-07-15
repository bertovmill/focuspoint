import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();

    const [todo] = await sql`SELECT recurrence FROM todos WHERE id = ${id}`;
    if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (todo.recurrence && todo.recurrence !== "none") {
      const [row] = await sql`
        UPDATE todos
        SET due_date = CURRENT_DATE, completed_at = NULL
        WHERE id = ${id}
        RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
      `;
      return NextResponse.json(row);
    }

    const [row] = await sql`
      UPDATE todos
      SET completed = FALSE, completed_at = NULL
      WHERE id = ${id}
      RETURNING id, title, completed, in_progress, priority, due_date, recurrence, created_at, completed_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

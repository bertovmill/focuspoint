import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

function nextDueDate(recurrence: string): string {
  const today = new Date();
  if (recurrence === "daily") today.setDate(today.getDate() + 1);
  else if (recurrence === "weekly") today.setDate(today.getDate() + 7);
  else if (recurrence === "monthly") today.setMonth(today.getMonth() + 1);
  return today.toISOString().split("T")[0];
}

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();

    const [todo] = await sql`SELECT recurrence FROM todos WHERE id = ${id}`;
    if (!todo) return NextResponse.json({ error: "Not found" }, { status: 404 });

    if (todo.recurrence && todo.recurrence !== "none") {
      const next_due = nextDueDate(todo.recurrence);
      await sql`UPDATE todos SET due_date = ${next_due} WHERE id = ${id}`;
      return NextResponse.json({ success: true, recurring: true, next_due });
    }

    await sql`UPDATE todos SET completed = TRUE, completed_at = NOW() WHERE id = ${id}`;
    return NextResponse.json({ success: true, recurring: false });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

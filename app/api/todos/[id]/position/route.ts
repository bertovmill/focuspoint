import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Where a task's card sits on the Tasks canvas, in Excalidraw scene coordinates.
// Its own sub-route (like /timer and /complete) so dragging a card doesn't have to
// round-trip through the big COALESCE update in PATCH /api/todos/[id].
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { x, y } = await req.json();
    const nx = Number(x);
    const ny = Number(y);
    if (!Number.isFinite(nx) || !Number.isFinite(ny)) {
      return NextResponse.json({ error: "x and y must be numbers" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE todos SET canvas_x = ${nx}, canvas_y = ${ny}
      WHERE id = ${id}
      RETURNING id, canvas_x, canvas_y
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to move task" }, { status: 500 });
  }
}

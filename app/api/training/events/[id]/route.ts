import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { shapeEvent } from "@/lib/training";

type Params = { params: Promise<{ id: string }> };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sql = getDb();
    const [cur] = await sql`SELECT name, to_char(event_date, 'YYYY-MM-DD') AS d, kind, notes FROM training_events WHERE id = ${id}`;
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const name = body.name !== undefined ? String(body.name).trim() : cur.name;
    const date = body.event_date !== undefined ? String(body.event_date) : cur.d;
    if (!name || !ISO.test(date)) return NextResponse.json({ error: "Bad name or date" }, { status: 400 });
    const [row] = await sql`
      UPDATE training_events SET name = ${name}, event_date = ${date}, kind = ${body.kind ?? cur.kind},
        notes = ${body.notes !== undefined ? body.notes?.trim?.() || null : cur.notes}
      WHERE id = ${id}
      RETURNING id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date, kind, notes
    `;
    return NextResponse.json(shapeEvent(row as Record<string, unknown>));
  } catch {
    return NextResponse.json({ error: "Couldn't update the race" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await getDb()`DELETE FROM training_events WHERE id = ${id}`;
  return NextResponse.json({ ok: true });
}

import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = getDb();
  const [row] = await sql`
    SELECT id, title, session, events, created_at, updated_at
    FROM threads WHERE id = ${id}
  `;
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body: { title?: string; session?: unknown; events?: unknown } =
    await req.json();
  const sql = getDb();

  // Fetch current values so we only overwrite what was sent.
  const [current] = await sql`
    SELECT title, session, events FROM threads WHERE id = ${id}
  `;
  if (!current) return NextResponse.json({ error: "not found" }, { status: 404 });

  const title = "title" in body ? body.title : current.title;
  const session =
    "session" in body
      ? JSON.stringify(body.session)
      : JSON.stringify(current.session);
  const events =
    "events" in body
      ? JSON.stringify(body.events)
      : JSON.stringify(current.events);

  const [row] = await sql`
    UPDATE threads
    SET title = ${title as string},
        session = ${session}::jsonb,
        events = ${events}::jsonb,
        updated_at = NOW()
    WHERE id = ${id}
    RETURNING id, title, session, events, created_at, updated_at
  `;
  return NextResponse.json(row);
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sql = getDb();
  await sql`DELETE FROM threads WHERE id = ${id}`;
  return new NextResponse(null, { status: 204 });
}

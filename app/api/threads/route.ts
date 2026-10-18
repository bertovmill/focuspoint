import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * The thread list. By default titles and timestamps only: every launch reads
 * this, and with each thread's full transcript attached it had grown past 10 MB,
 * which was most of the 5–10 seconds Cael took to open on the phone. A thread's
 * session and events come from `/api/threads/[id]` when it is opened.
 * `?include=events` keeps the full rows for the traces view.
 */
export async function GET(req: Request) {
  const sql = getDb();
  const full = new URL(req.url).searchParams.get("include") === "events";
  const rows = full
    ? await sql`
        SELECT id, title, session, events, created_at, updated_at
        FROM threads
        ORDER BY updated_at DESC
      `
    : await sql`
        SELECT id, title, created_at, updated_at
        FROM threads
        ORDER BY updated_at DESC
      `;
  return NextResponse.json(rows);
}

export async function POST(req: Request) {
  const { id, title = "" } = await req.json();
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  const sql = getDb();
  const [row] = await sql`
    INSERT INTO threads (id, title)
    VALUES (${id}, ${title})
    ON CONFLICT (id) DO UPDATE SET title = EXCLUDED.title, updated_at = NOW()
    RETURNING id, title, session, events, created_at, updated_at
  `;
  return NextResponse.json(row);
}

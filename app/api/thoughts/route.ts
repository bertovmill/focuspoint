import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 30), 1000);
    const sql = getDb();
    const rows = await sql`
      SELECT id, content, tags, created_at
      FROM thoughts
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

/**
 * Write a note by hand, from the composer in the Notes tab. Same table as the
 * notes Cael captures (agent/tools/capture_thought.ts) so both show up in one
 * list and both are searchable by meaning — the embedding is best-effort, so a
 * flaky gateway costs semantic search for that note, never the note itself.
 */
export async function POST(req: Request) {
  try {
    const { content, tags } = await req.json();
    const trimmed = typeof content === "string" ? content.trim() : "";
    if (!trimmed) return NextResponse.json({ error: "Content required" }, { status: 400 });
    const cleanTags = Array.isArray(tags)
      ? tags.map((t) => String(t).trim()).filter(Boolean).slice(0, 12)
      : [];
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thoughts (content, tags)
      VALUES (${trimmed}, ${cleanTags})
      RETURNING id, content, tags, created_at
    `;
    try {
      const lit = toVectorLiteral(await embedText(trimmed));
      await sql`UPDATE thoughts SET embedding = ${lit}::vector WHERE id = ${row.id}`;
    } catch (err) {
      console.error("POST thought: embedding failed", err);
    }
    return NextResponse.json(row, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Failed to save note" }, { status: 500 });
  }
}

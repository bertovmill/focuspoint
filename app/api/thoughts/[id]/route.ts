import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { content } = await req.json();
    const trimmed = content?.trim();
    if (!trimmed) return NextResponse.json({ error: "Content required" }, { status: 400 });
    const sql = getDb();
    // Re-embed the edited content so semantic search stays in sync. Best-effort:
    // if the embeddings gateway fails, still persist the text edit.
    let embedding: string | null = null;
    try {
      embedding = toVectorLiteral(await embedText(trimmed));
    } catch (err) {
      console.error("PATCH thought: embedding failed", err);
    }
    const rows = embedding
      ? await sql`
          UPDATE thoughts SET content = ${trimmed}, embedding = ${embedding}::vector
          WHERE id = ${id}
          RETURNING id, content, tags, created_at
        `
      : await sql`
          UPDATE thoughts SET content = ${trimmed} WHERE id = ${id}
          RETURNING id, content, tags, created_at
        `;
    return NextResponse.json(rows[0]);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM thoughts WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

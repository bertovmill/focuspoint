import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const trimmed = typeof body.content === "string" ? body.content.trim() : "";
    // `image_url` is optional: left out keeps the photo, null removes it.
    const touchesImage = "image_url" in body;
    const imageUrl = typeof body.image_url === "string" && body.image_url ? body.image_url : null;
    const sql = getDb();
    if (!trimmed) {
      // Text cleared: fine only if the note keeps a photo.
      const [current] = await sql`SELECT image_url FROM thoughts WHERE id = ${id}`;
      const keepsPhoto = touchesImage ? imageUrl : current?.image_url;
      if (!keepsPhoto) return NextResponse.json({ error: "Content required" }, { status: 400 });
    }
    // Re-embed the edited content so semantic search stays in sync. Best-effort:
    // if the embeddings gateway fails, still persist the text edit. An empty note
    // has no meaning to embed, so its embedding is cleared.
    let embedding: string | null = null;
    if (trimmed) {
      try {
        embedding = toVectorLiteral(await embedText(trimmed));
      } catch (err) {
        console.error("PATCH thought: embedding failed", err);
      }
    }
    const rows = await sql`
      UPDATE thoughts SET
        content = ${trimmed},
        image_url = CASE WHEN ${touchesImage} THEN ${imageUrl} ELSE image_url END,
        embedding = CASE
          WHEN ${embedding}::text IS NOT NULL THEN ${embedding}::vector
          WHEN ${trimmed} = '' THEN NULL
          ELSE embedding
        END
      WHERE id = ${id}
      RETURNING id, content, tags, image_url, created_at
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

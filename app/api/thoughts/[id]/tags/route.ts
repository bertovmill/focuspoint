import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { normalizeTags } from "@/lib/note-tags";

// PUT { tags } — replace a note's tags. Separate from PATCH on the note so a tag
// change doesn't touch the text or re-embed it.
export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const body = await req.json();
    if (!Array.isArray(body?.tags)) return NextResponse.json({ error: "tags must be an array" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      UPDATE thoughts SET tags = ${normalizeTags(body.tags)} WHERE id = ${n}
      RETURNING id, content, tags, image_url, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

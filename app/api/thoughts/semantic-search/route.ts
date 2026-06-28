import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { embedText, toVectorLiteral } from "@/lib/embeddings";

// Semantic search over notes using pgvector. The query is embedded once, then
// ranked against the stored per-note `embedding` column via the `<=>` cosine
// distance operator (smaller = closer). Optional `tag` narrows to notes carrying
// that tag, so tag filtering and meaning-based search compose.
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const tag = searchParams.get("tag")?.trim() || null;
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  if (!query) return NextResponse.json([]);

  try {
    const lit = toVectorLiteral(await embedText(query));
    const sql = getDb();
    const rows = tag
      ? await sql`
          SELECT id, content, tags, created_at,
                 1 - (embedding <=> ${lit}::vector) AS score
          FROM thoughts
          WHERE embedding IS NOT NULL AND tags @> ARRAY[${tag}]::text[]
          ORDER BY embedding <=> ${lit}::vector
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, content, tags, created_at,
                 1 - (embedding <=> ${lit}::vector) AS score
          FROM thoughts
          WHERE embedding IS NOT NULL
          ORDER BY embedding <=> ${lit}::vector
          LIMIT ${limit}
        `;

    const results = rows.map((r) => ({
      id: Number(r.id),
      content: String(r.content),
      tags: Array.isArray(r.tags) ? r.tags : [],
      created_at:
        r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
      score: Number(r.score),
    }));
    return NextResponse.json(results);
  } catch (err) {
    console.error("semantic-search failed", err);
    return NextResponse.json(
      { error: "Semantic search is unavailable" },
      { status: 503 },
    );
  }
}

import { NextResponse } from "next/server";
import { embed, embedMany } from "ai";
import { getDb } from "@/lib/db";

// Embeddings model served through the Vercel AI Gateway (authenticated via
// VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY). Small + cheap; 1536 dims.
const EMBED_MODEL = "openai/text-embedding-3-small";

// In-memory cache of note embeddings, keyed by `${id}:${content}` so an edited
// note re-embeds but unchanged notes are reused across warm invocations.
const embedCache = new Map<string, number[]>();

function cosine(a: number[], b: number[]) {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const query = (searchParams.get("q") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
  if (!query) return NextResponse.json([]);

  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, content, tags, created_at
      FROM thoughts
      ORDER BY created_at DESC
      LIMIT 500
    `;
    if (rows.length === 0) return NextResponse.json([]);

    // Figure out which notes still need an embedding.
    const keyOf = (r: { id: number; content: string }) => `${r.id}:${r.content}`;
    const uncached = rows.filter((r) => !embedCache.has(keyOf(r as never)));
    if (uncached.length > 0) {
      const { embeddings } = await embedMany({
        model: EMBED_MODEL,
        values: uncached.map((r) => String(r.content)),
      });
      uncached.forEach((r, i) => embedCache.set(keyOf(r as never), embeddings[i]));
    }

    const { embedding: queryVec } = await embed({ model: EMBED_MODEL, value: query });

    const scored = rows
      .map((r) => ({
        id: Number(r.id),
        content: String(r.content),
        tags: Array.isArray(r.tags) ? r.tags : [],
        created_at:
          r.created_at instanceof Date
            ? r.created_at.toISOString()
            : String(r.created_at),
        score: cosine(queryVec, embedCache.get(keyOf(r as never))!),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    return NextResponse.json(scored);
  } catch (err) {
    console.error("semantic-search failed", err);
    return NextResponse.json(
      { error: "Semantic search is unavailable" },
      { status: 503 },
    );
  }
}

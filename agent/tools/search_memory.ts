import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { embedText, toVectorLiteral } from "../../lib/embeddings.js";

export default defineTool({
  description:
    "Search past thoughts and notes the user has captured. Matches by *meaning* (semantic search), so it finds relevant notes even when they don't share the exact words. Use this to recall context about the user before answering questions about them, their goals, or their history.",
  inputSchema: z.object({
    query: z.string().describe("What to recall — a topic, question, or theme"),
    limit: z.number().int().min(1).max(20).default(10),
  }),
  async execute({ query, limit }) {
    const sql = getDb();

    // Semantic path: embed the query and rank notes by cosine distance against
    // the stored pgvector embeddings.
    try {
      const lit = toVectorLiteral(await embedText(query));
      const rows = await sql`
        SELECT id, content, tags, created_at,
               1 - (embedding <=> ${lit}::vector) AS score
        FROM thoughts
        WHERE embedding IS NOT NULL
        ORDER BY embedding <=> ${lit}::vector
        LIMIT ${limit}
      `;
      if (rows.length > 0) {
        const results = rows.map((r) => ({
          id: Number(r.id),
          content: String(r.content),
          tags: Array.isArray(r.tags) ? r.tags : [],
          created_at:
            r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
          score: Number(r.score),
        }));
        return { results, count: results.length };
      }
      // Fall through to keyword search if nothing has embeddings yet.
    } catch (err) {
      console.error("search_memory: semantic search failed, falling back to keyword", err);
    }

    // Keyword fallback (ILIKE) — used when embeddings are unavailable or absent.
    const pattern = `%${query.replace(/[%_]/g, "\\$&")}%`;
    const rows = await sql`
      SELECT id, content, tags, created_at
      FROM thoughts
      WHERE content ILIKE ${pattern}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    const results = rows.map((r) => ({
      id: Number(r.id),
      content: String(r.content),
      tags: Array.isArray(r.tags) ? r.tags : [],
      created_at: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    }));
    return { results, count: results.length };
  },
});

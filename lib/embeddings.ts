import { embed, embedMany } from "ai";

// Embeddings model served through the Vercel AI Gateway (authenticated via
// VERCEL_OIDC_TOKEN / AI_GATEWAY_API_KEY). 1536 dims — half the storage/index
// cost of text-embedding-3-large with little practical recall loss.
export const EMBED_MODEL = "openai/text-embedding-3-small";
export const EMBED_DIMS = 1536;

/** Embed a single string (e.g. a search query or one note). */
export async function embedText(value: string): Promise<number[]> {
  const { embedding } = await embed({ model: EMBED_MODEL, value });
  return embedding;
}

/** Embed many strings at once, preserving input order. */
export async function embedTexts(values: string[]): Promise<number[][]> {
  if (values.length === 0) return [];
  const { embeddings } = await embedMany({
    model: EMBED_MODEL,
    values,
    maxParallelCalls: 2,
  });
  return embeddings;
}

/**
 * Format a JS number[] as a pgvector literal string, e.g. "[0.1,0.2,...]".
 * Pass the result into a SQL query with a `::vector` cast.
 */
export function toVectorLiteral(vec: number[]): string {
  return `[${vec.join(",")}]`;
}

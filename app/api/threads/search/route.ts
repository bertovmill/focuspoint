import { getDb } from "@/lib/db";
import { NextResponse } from "next/server";

/**
 * Chat search over what was said, not just titles. The thread list loads titles
 * only (transcripts are lazy, see ../route.ts), so the history rail can't match
 * message text itself; it asks here and merges the IDs with its own title hits.
 *
 * Only whole messages are searched: the user's on `message.received` and Cael's
 * on `message.completed`. Streaming deltas and tool traffic would match noise.
 * Every word has to appear somewhere in the chat, in any order.
 */
export async function GET(req: Request) {
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 8)
    // Literal match: LIKE's own wildcards in a search word mean nothing here.
    .map((t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  if (terms.length === 0) return NextResponse.json({ ids: [] });

  const sql = getDb();
  const rows = await sql`
    WITH said AS (
      SELECT t.id, t.updated_at,
        lower(coalesce(t.title, '') || ' ' || coalesce((
          SELECT string_agg(e->'data'->>'message', ' ')
          FROM jsonb_array_elements(
            CASE WHEN jsonb_typeof(t.events) = 'array' THEN t.events ELSE '[]'::jsonb END
          ) e
          WHERE e->>'type' IN ('message.received', 'message.completed')
        ), '')) AS hay
      FROM threads t
    )
    SELECT id FROM said
    WHERE hay LIKE ALL(${terms}::text[])
    ORDER BY updated_at DESC
    LIMIT 200
  `;
  return NextResponse.json({ ids: rows.map((r) => r.id as string) });
}

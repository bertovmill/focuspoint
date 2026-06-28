import { NextResponse } from "next/server";
import { getDb } from "../../../lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const [row] = await sql`
      SELECT id, dream_date, summary, patterns, insights, thoughts_analyzed, todos_analyzed, created_at
      FROM dreams
      ORDER BY created_at DESC
      LIMIT 1
    `;
    if (!row) return NextResponse.json(null);
    return NextResponse.json({
      id: Number(row.id),
      dream_date: String(row.dream_date),
      summary: String(row.summary),
      patterns: row.patterns as Array<{ theme: string; evidence: string; frequency: number }>,
      insights: row.insights as string[],
      thoughts_analyzed: Number(row.thoughts_analyzed),
      todos_analyzed: Number(row.todos_analyzed),
      created_at: String(row.created_at),
    });
  } catch {
    return NextResponse.json(null);
  }
}

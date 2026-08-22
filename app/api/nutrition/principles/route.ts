import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { NUTRITION_TAGS } from "@/lib/nutrition";

// The food notes Berto has already captured, pulled straight out of `thoughts`
// by tag — nothing is copied into a nutrition-only table, so anything Cael
// captures later shows up here on its own.
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 60), 200);
    const sql = getDb();
    const rows = await sql`
      SELECT id, content, tags, created_at
      FROM thoughts
      WHERE tags && ${[...NUTRITION_TAGS]}::text[]
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

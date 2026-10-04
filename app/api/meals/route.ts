import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 14), 60);
    const sql = getDb();
    const rows = await sql`
      SELECT id, meal_date, slot, name, description, cuisine, image_url, feedback, feedback_at, created_at
      FROM meal_recommendations
      ORDER BY meal_date DESC, CASE slot WHEN 'meal1' THEN 1 WHEN 'meal2' THEN 2 WHEN 'meal3' THEN 3 WHEN 'snack' THEN 4 ELSE 5 END
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 14), 60);
    const sql = getDb();
    const rows = await sql`
      SELECT id, meal_date, name, description, cuisine, image_url, feedback, feedback_at, created_at
      FROM meal_recommendations
      ORDER BY meal_date DESC
      LIMIT ${limit}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

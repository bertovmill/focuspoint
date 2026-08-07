import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// Thumbs up/down on today's (or any) meal. Sending null clears it (toggle off).
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { feedback } = await req.json();
    if (feedback !== "up" && feedback !== "down" && feedback !== null) {
      return NextResponse.json({ error: "feedback must be 'up', 'down', or null" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE meal_recommendations
      SET feedback = ${feedback}, feedback_at = ${feedback ? new Date().toISOString() : null}
      WHERE id = ${id}
      RETURNING id, meal_date, name, description, cuisine, image_url, feedback, feedback_at, created_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to update feedback" }, { status: 500 });
  }
}

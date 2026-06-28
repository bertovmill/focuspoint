import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function GET() {
  try {
    const sql = getDb();
    const [thoughts, activeTodos, completedToday] = await Promise.all([
      sql`SELECT COUNT(*) as count FROM thoughts`,
      sql`SELECT COUNT(*) as count FROM todos WHERE completed = FALSE`,
      sql`SELECT COUNT(*) as count FROM todos WHERE completed = TRUE AND completed_at >= NOW() - INTERVAL '24 hours'`,
    ]);
    return NextResponse.json({
      totalThoughts: Number(thoughts[0].count),
      activeTodos: Number(activeTodos[0].count),
      completedToday: Number(completedToday[0].count),
    });
  } catch {
    return NextResponse.json({ totalThoughts: 0, activeTodos: 0, completedToday: 0 });
  }
}

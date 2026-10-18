import { NextResponse } from "next/server";
import { ensureSchema, getDb } from "@/lib/db";

// The job-search pipeline behind /career: one row per company/role being pursued.
export async function GET() {
  try {
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT * FROM career_targets
      ORDER BY next_date ASC NULLS LAST, updated_at DESC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b.company?.trim()) return NextResponse.json({ error: "company required" }, { status: 400 });
    await ensureSchema();
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO career_targets (company, role, url, contact_name, contact_title, contact_url, status, next_step, next_date, notes)
      VALUES (${b.company.trim()}, ${b.role || null}, ${b.url || null}, ${b.contact_name || null}, ${b.contact_title || null},
              ${b.contact_url || null}, ${b.status || "target"}, ${b.next_step || null}, ${b.next_date || null}, ${b.notes || null})
      RETURNING *
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create target" }, { status: 500 });
  }
}

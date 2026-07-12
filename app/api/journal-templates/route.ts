import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export async function GET() {
  try {
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, fields, created_at
      FROM journal_templates
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { name, fields } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "name required" }, { status: 400 });
    if (!Array.isArray(fields) || fields.length === 0) {
      return NextResponse.json({ error: "at least one field is required" }, { status: 400 });
    }
    await ensureSchema();
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO journal_templates (name, fields)
      VALUES (${name.trim()}, ${JSON.stringify(fields)})
      RETURNING id, name, fields, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create journal template" }, { status: 500 });
  }
}

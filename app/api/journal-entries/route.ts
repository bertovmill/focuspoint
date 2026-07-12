import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const templateId = searchParams.get("template_id");
    if (!templateId) return NextResponse.json({ error: "template_id required" }, { status: 400 });
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT id, template_id, data, created_at
      FROM journal_entries
      WHERE template_id = ${templateId}
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { template_id, data } = await req.json();
    if (!template_id) return NextResponse.json({ error: "template_id required" }, { status: 400 });
    await ensureSchema();
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO journal_entries (template_id, data)
      VALUES (${template_id}, ${JSON.stringify(data ?? {})})
      RETURNING id, template_id, data, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create journal entry" }, { status: 500 });
  }
}

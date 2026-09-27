import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const b = await req.json();
    const sql = getDb();
    const [row] = await sql`
      UPDATE career_targets SET
        company = COALESCE(${b.company ?? null}, company),
        role = COALESCE(${b.role ?? null}, role),
        url = COALESCE(${b.url ?? null}, url),
        contact_name = COALESCE(${b.contact_name ?? null}, contact_name),
        contact_title = COALESCE(${b.contact_title ?? null}, contact_title),
        contact_url = COALESCE(${b.contact_url ?? null}, contact_url),
        status = COALESCE(${b.status ?? null}, status),
        next_step = COALESCE(${b.next_step ?? null}, next_step),
        next_date = COALESCE(${b.next_date ?? null}::date, next_date),
        notes = COALESCE(${b.notes ?? null}, notes),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING *
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM career_targets WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

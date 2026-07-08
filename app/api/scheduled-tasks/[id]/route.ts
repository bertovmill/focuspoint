import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { isValidCron, describeCron } from "@/lib/cron";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const { title, prompt, cron, notify, enabled } = await req.json();
    if (cron !== undefined && !isValidCron(cron)) {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE scheduled_tasks
      SET
        title = COALESCE(${title?.trim() ?? null}, title),
        prompt = COALESCE(${prompt?.trim() ?? null}, prompt),
        cron = COALESCE(${cron?.trim() ?? null}, cron),
        notify = COALESCE(${notify ?? null}, notify),
        enabled = COALESCE(${enabled ?? null}, enabled),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, prompt, cron, notify, enabled, last_run_at, created_at, updated_at
    `;
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...row, schedule: describeCron(String(row.cron)) });
  } catch {
    return NextResponse.json({ error: "Failed to update scheduled task" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM scheduled_tasks WHERE id = ${id}`;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

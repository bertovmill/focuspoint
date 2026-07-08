import { NextResponse } from "next/server";
import { getDb, ensureSchema } from "@/lib/db";
import { isValidCron, describeCron } from "@/lib/cron";

export async function GET() {
  try {
    await ensureSchema();
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, prompt, cron, notify, enabled, last_run_at, created_at, updated_at
      FROM scheduled_tasks
      ORDER BY created_at DESC
    `;
    return NextResponse.json(rows.map((r) => ({ ...r, schedule: describeCron(String(r.cron)) })));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { title, prompt, cron, notify = true } = await req.json();
    if (!title?.trim() || !prompt?.trim() || !cron?.trim()) {
      return NextResponse.json({ error: "title, prompt, and cron are required" }, { status: 400 });
    }
    if (!isValidCron(cron)) {
      return NextResponse.json({ error: "Invalid cron expression" }, { status: 400 });
    }
    await ensureSchema();
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO scheduled_tasks (title, prompt, cron, notify)
      VALUES (${title.trim()}, ${prompt.trim()}, ${cron.trim()}, ${notify})
      RETURNING id, title, prompt, cron, notify, enabled, last_run_at, created_at, updated_at
    `;
    return NextResponse.json({ ...row, schedule: describeCron(String(row.cron)) });
  } catch {
    return NextResponse.json({ error: "Failed to create scheduled task" }, { status: 500 });
  }
}

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { describeCron } from "../../lib/cron.js";

export default defineTool({
  description: "List all scheduled tasks — their cadence, whether they're enabled, and when each last ran. Call this before editing or deleting a task if you don't already know its id.",
  inputSchema: z.object({}),
  async execute() {
    const sql = getDb();
    const rows = await sql`
      SELECT id, title, prompt, cron, notify, enabled, last_run_at, created_at
      FROM scheduled_tasks
      ORDER BY created_at DESC
    `;
    return rows.map((r) => ({
      id: Number(r.id),
      title: String(r.title),
      prompt: String(r.prompt),
      cron: String(r.cron),
      schedule: describeCron(String(r.cron)),
      notify: Boolean(r.notify),
      enabled: Boolean(r.enabled),
      last_run_at: r.last_run_at ? String(r.last_run_at) : null,
    }));
  },
  toModelOutput(output) {
    if (output.length === 0) return { type: "text", value: "No scheduled tasks yet." };
    const lines = output.map(
      (t) => `- [${t.enabled ? "on" : "paused"}] "${t.title}" — ${t.schedule} (id: ${t.id})`
    );
    return { type: "text", value: lines.join("\n") };
  },
});

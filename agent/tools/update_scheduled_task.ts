import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { isValidCron, describeCron } from "../../lib/cron.js";

export default defineTool({
  description:
    "Change, pause, or resume an existing scheduled task. Use list_scheduled_tasks first if you don't know its id. Confirm with the user before changing or pausing a task they didn't just create.",
  inputSchema: z.object({
    id: z.number().int(),
    title: z.string().min(1).optional(),
    prompt: z.string().min(1).optional(),
    cron: z.string().optional().describe("Standard 5-field cron string evaluated in UTC (minute hour day month weekday)"),
    notify: z.boolean().optional(),
    enabled: z.boolean().optional().describe("Set false to pause the task without deleting it"),
  }),
  async execute({ id, cron, ...patch }) {
    if (cron !== undefined && !isValidCron(cron)) {
      throw new Error(`Invalid cron expression: "${cron}".`);
    }
    const sql = getDb();
    const [row] = await sql`
      UPDATE scheduled_tasks
      SET
        title = COALESCE(${patch.title ?? null}, title),
        prompt = COALESCE(${patch.prompt ?? null}, prompt),
        cron = COALESCE(${cron ?? null}, cron),
        notify = COALESCE(${patch.notify ?? null}, notify),
        enabled = COALESCE(${patch.enabled ?? null}, enabled),
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, title, cron, enabled
    `;
    if (!row) throw new Error(`No scheduled task with id ${id}.`);
    return {
      id: Number(row.id),
      title: String(row.title),
      enabled: Boolean(row.enabled),
      schedule: describeCron(String(row.cron)),
    };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Updated "${output.title}" — ${output.schedule}, ${output.enabled ? "enabled" : "paused"} (id: ${output.id}).`,
    };
  },
});

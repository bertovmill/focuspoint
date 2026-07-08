import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { isValidCron, describeCron } from "../../lib/cron.js";

export default defineTool({
  description:
    "Create a new recurring scheduled task. It fires automatically on the given cron cadence, and Cael runs the prompt using its normal tools at that time — e.g. a daily digest, a weekly check-in, a reminder. Confirm the desired time and cadence with the user before calling this.",
  inputSchema: z.object({
    title: z.string().min(1).describe("Short label for the task, e.g. 'Evening wind-down check-in'"),
    prompt: z
      .string()
      .min(1)
      .describe("Instructions for what Cael should do when this fires, written as if telling Cael what to do in the moment"),
    cron: z
      .string()
      .describe(
        "Standard 5-field cron string evaluated in UTC: minute hour day month weekday. Each field is '*' or a number. E.g. '0 21 * * *' = daily at 9pm UTC, '0 9 * * 1' = every Monday at 9am UTC."
      ),
    notify: z
      .boolean()
      .default(true)
      .describe("Whether Cael should text the result to the user. Set false for tasks that just take an action silently (e.g. capture a thought) rather than report back."),
  }),
  async execute({ title, prompt, cron, notify }) {
    if (!isValidCron(cron)) {
      throw new Error(
        `Invalid cron expression: "${cron}". Use 5 space-separated fields (minute hour day month weekday), each "*" or a number.`
      );
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO scheduled_tasks (title, prompt, cron, notify)
      VALUES (${title}, ${prompt}, ${cron}, ${notify})
      RETURNING id, title, cron
    `;
    return {
      id: Number(row.id),
      title: String(row.title),
      cron: String(row.cron),
      schedule: describeCron(String(row.cron)),
    };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Scheduled task created: "${output.title}" — ${output.schedule} (id: ${output.id}).`,
    };
  },
});

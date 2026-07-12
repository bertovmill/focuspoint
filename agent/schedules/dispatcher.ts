import { defineSchedule } from "eve/schedules";

import twilio from "../channels/twilio.js";
import { getDb } from "../../lib/db.js";
import { cronMatchesDate } from "../../lib/cron.js";

// Dispatcher for application-managed scheduled tasks (see agent/tools/create_scheduled_task.ts
// and friends). Vercel Hobby plans cap ALL cron jobs at once per day, so this wakes once daily
// (not per-minute) and runs any enabled task whose day-of-month/month/day-of-week is due today —
// the specific hour/minute in a task's own cron is not honored, since we only get one tick.
export default defineSchedule({
  cron: "0 13 * * *",
  async run({ receive, waitUntil, appAuth }) {
    const phoneNumber = process.env.MY_PHONE_NUMBER;
    if (!phoneNumber) {
      console.warn("[dispatcher] MY_PHONE_NUMBER not set — skipping run.");
      return;
    }

    const sql = getDb();
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);

    const candidates = await sql`
      SELECT id, title, prompt, cron, notify
      FROM scheduled_tasks
      WHERE enabled = TRUE
        AND (last_run_at IS NULL OR last_run_at < ${dayStart.toISOString()})
    `;
    const due = candidates.filter((row) => cronMatchesDate(String(row.cron), now));
    if (due.length === 0) return;

    for (const task of due) {
      const claimed = await sql`
        UPDATE scheduled_tasks
        SET last_run_at = NOW()
        WHERE id = ${task.id}
          AND (last_run_at IS NULL OR last_run_at < ${dayStart.toISOString()})
        RETURNING id
      `;
      if (claimed.length === 0) continue; // already claimed by an overlapping tick

      const message = [
        `Run this scheduled task: "${String(task.title)}".`,
        task.notify
          ? "IMPORTANT: your entire reply is sent to me directly as a text message — there is no separate send step. Output ONLY the finished message: no preamble, no markdown, no asking whether to send it."
          : "Perform this using your tools. Only reply with a text if there's something worth telling me — otherwise just do the work and finish without sending a message.",
        "",
        String(task.prompt),
      ].join("\n");

      waitUntil(
        receive(twilio, {
          message,
          target: { phoneNumber },
          auth: appAuth,
        }),
      );
    }
  },
});

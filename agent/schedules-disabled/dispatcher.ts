import { defineSchedule } from "eve/schedules";

import twilio from "../channels/twilio.js";
import { getDb } from "../../lib/db.js";
import { cronMatches } from "../../lib/cron.js";

// DISABLED (moved out of agent/schedules/ so eve doesn't register it as a Vercel Cron Job):
// Vercel Hobby plan only allows daily cron jobs, and this dispatcher needs to run every minute,
// which blocked production deploys. Move this file back to agent/schedules/dispatcher.ts once
// either the Vercel project is on Pro, or the dispatch is moved to an externally-triggered route.
//
// Dispatcher for application-managed scheduled tasks (see agent/tools/create_scheduled_task.ts
// and friends). Wakes once a minute, finds rows whose cron matches the current UTC minute and
// haven't already run this minute, atomically claims them, and hands each one to Cael via SMS.
export default defineSchedule({
  cron: "* * * * *",
  async run({ receive, waitUntil, appAuth }) {
    const phoneNumber = process.env.MY_PHONE_NUMBER;
    if (!phoneNumber) {
      console.warn("[dispatcher] MY_PHONE_NUMBER not set — skipping run.");
      return;
    }

    const sql = getDb();
    const now = new Date();
    const minuteStart = new Date(now);
    minuteStart.setUTCSeconds(0, 0);

    const candidates = await sql`
      SELECT id, title, prompt, cron, notify
      FROM scheduled_tasks
      WHERE enabled = TRUE
        AND (last_run_at IS NULL OR last_run_at < ${minuteStart.toISOString()})
    `;
    const due = candidates.filter((row) => cronMatches(String(row.cron), now));
    if (due.length === 0) return;

    for (const task of due) {
      const claimed = await sql`
        UPDATE scheduled_tasks
        SET last_run_at = NOW()
        WHERE id = ${task.id}
          AND (last_run_at IS NULL OR last_run_at < ${minuteStart.toISOString()})
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

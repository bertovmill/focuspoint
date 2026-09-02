import { defineSchedule } from "eve/schedules";

import twilio from "../channels/twilio.js";
import { getDb } from "../../lib/db.js";
import { cronMatchesDate } from "../../lib/cron.js";
import { syncLuma } from "../../lib/luma-sync.js";
import { ensureTodaysMeals } from "../../lib/meal-suggest.js";
import { syncGithubPrs } from "../../lib/github-sync.js";
import { syncHealthRange } from "../../lib/health-sync.js";
import { syncReadwise } from "../../lib/readwise-sync.js";
import { syncPortfolio } from "../../lib/portfolio-sync.js";

// Dispatcher for application-managed scheduled tasks (see agent/tools/create_scheduled_task.ts
// and friends). Vercel Hobby plans cap ALL cron jobs at once per day, so this wakes once daily
// (not per-minute) and runs any enabled task whose day-of-month/month/day-of-week is due today —
// the specific hour/minute in a task's own cron is not honored, since we only get one tick.
export default defineSchedule({
  cron: "0 13 * * *",
  async run({ to, waitUntil, appAuth }) {
    // Refresh the Luma mirror first. Vercel Hobby allows exactly one cron a day
    // across the whole project, so this tick is the only scheduled slot there is
    // and the sync has to share it. Deliberately above the phone-number guard —
    // a missing MY_PHONE_NUMBER shouldn't also stop the calendar from updating —
    // and never fatal: Luma being down must not stop tasks from dispatching.
    try {
      const luma = await syncLuma();
      console.log(`[dispatcher] Luma: ${luma.events} events, ${luma.guests} guests, ${luma.people} people.`);
    } catch (err) {
      console.warn("[dispatcher] Luma sync failed:", err);
    }

    // Today's three meal recommendations (lunch, snack, dinner) with their photos.
    // Same reasoning as the Luma sync above: this daily tick is the only scheduled
    // slot the project gets, so the meal plan has to ride on it — and it sits above
    // the phone-number guard because the plan is for the app, not the text message.
    try {
      const meals = await ensureTodaysMeals();
      console.log(
        `[dispatcher] meals: filled ${meals.filled.join(", ") || "none"}` +
          (meals.failed.length ? `, failed ${meals.failed.join(", ")}` : "") +
          (meals.already.length ? `, already had ${meals.already.join(", ")}` : ""),
      );
    } catch (err) {
      console.warn("[dispatcher] meal plan failed:", err);
    }

    // Merged pull requests, which are what the Craft form of wealth is measured in.
    // Same rationale as the two syncs above — this daily tick is the only scheduled
    // slot on Hobby, so the mirror rides along, and a GitHub outage must not stop
    // scheduled tasks from dispatching. Trailing two months only; the full backfill
    // is a manual POST to /api/github/sync?full=1.
    try {
      const prs = await syncGithubPrs();
      console.log(`[dispatcher] GitHub: ${prs.fetched} merged PRs across ${prs.months} months.`);
    } catch (err) {
      console.warn("[dispatcher] GitHub PR sync failed:", err);
    }

    // Steps and sleep for the daily scorecard, via the Google Health API. Three days,
    // not one: the watch often uploads last night's sleep well after this tick, so
    // yesterday gets a second chance tomorrow. A no-op when Google isn't connected.
    try {
      const health = await syncHealthRange(3);
      console.log(
        health.connected
          ? `[dispatcher] Google Health: synced ${health.synced} day(s).`
          : "[dispatcher] Google Health: not connected, skipped.",
      );
    } catch (err) {
      console.warn("[dispatcher] Google Health sync failed:", err);
    }

    // The invested balance for the scorecard's portfolio row, via SnapTrade. A no-op
    // until a brokerage is connected, and never fatal — an aggregator outage must not
    // stop the scheduled tasks behind it.
    try {
      const portfolio = await syncPortfolio();
      console.log(
        portfolio.connected
          ? `[dispatcher] Portfolio: ${portfolio.amount ?? "no value"} ${portfolio.currency ?? ""}`.trim()
          : "[dispatcher] Portfolio: no brokerage connected, skipped.",
      );
    } catch (err) {
      console.warn("[dispatcher] Portfolio sync failed:", err);
    }

    // Notes written, from Readwise. Fourteen days rather than one: a Kindle sync can
    // land days late, and re-counting a settled day is free.
    try {
      const readwise = await syncReadwise(14);
      console.log(
        readwise.configured
          ? `[dispatcher] Readwise: ${readwise.days.reduce((n, d) => n + d.notes, 0)} notes over ${readwise.synced} days.`
          : "[dispatcher] Readwise: no token, skipped.",
      );
    } catch (err) {
      console.warn("[dispatcher] Readwise sync failed:", err);
    }

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
        // eve 0.49 replaced the schedule handler's `receive(channel, input)` with
        // `to(channel, target).send(message, options)`.
        to(twilio, { phoneNumber }).send(message, { auth: appAuth }),
      );
    }
  },
});

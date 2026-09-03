import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { dayKey, recordMetrics } from "../../lib/scorecard.js";

export default defineTool({
  description:
    "Record the user's daily scorecard numbers — steps and sleep. Use this whenever he mentions either in passing " +
    "('slept about seven and a half', 'hit 22k steps today'). Only pass the fields he actually mentioned; the other " +
    "is left untouched. Steps and sleep normally sync from his watch via the Google Health API, so use this to " +
    "correct them or when the sync hasn't caught up. Keystrokes are counted by the Mac agent and can't be set here.",
  inputSchema: z.object({
    steps: z.number().int().nonnegative().optional().describe("Step count for the day."),
    sleep_minutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Total minutes asleep. Convert from hours yourself — 7h30m is 450."),
    date: z.string().optional().describe("ISO date, e.g. '2026-08-29'. Defaults to today."),
  }),
  async execute({ steps, sleep_minutes, date }) {
    const sql = getDb();
    const day = date ?? dayKey(new Date());

    const patch: Record<string, number> = {};
    if (steps !== undefined) patch.steps = steps;
    if (sleep_minutes !== undefined) patch.sleep_minutes = sleep_minutes;
    if (Object.keys(patch).length) await recordMetrics(sql, day, patch);

    return { date: day, steps, sleep_minutes };
  },
  toModelOutput(output) {
    const parts: string[] = [];
    if (output.steps !== undefined) parts.push(`${output.steps.toLocaleString("en-CA")} steps`);
    if (output.sleep_minutes !== undefined) {
      const h = Math.floor(output.sleep_minutes / 60);
      const m = output.sleep_minutes % 60;
      parts.push(`${m ? `${h}h ${m}m` : `${h}h`} sleep`);
    }
    return {
      type: "text",
      value: parts.length ? `Logged for ${output.date}: ${parts.join(", ")}.` : `Nothing to log for ${output.date}.`,
    };
  },
});

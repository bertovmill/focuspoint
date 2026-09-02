import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { dayKey, recordMetrics, setFastingHeld } from "../../lib/scorecard.js";
import { setDay as setMeditation } from "../../lib/meditation.js";

export default defineTool({
  description:
    "Record the user's daily scorecard numbers — steps, sleep, whether the eating window held, minutes meditated, and his investment portfolio value. Use this whenever he mentions any of them in passing ('slept about seven and a half', 'hit 22k steps today', 'sat for twenty minutes', 'broke the window at 11'). Only pass the fields he actually mentioned; the others are left untouched. Steps and sleep normally sync from his watch via the Google Health API, so use this to correct them or when the sync hasn't caught up. Keystrokes are counted by the Mac agent and the journal key is earned by writing the journal page — neither can be set here.",
  inputSchema: z.object({
    steps: z.number().int().nonnegative().optional().describe("Step count for the day."),
    sleep_minutes: z
      .number()
      .int()
      .positive()
      .optional()
      .describe("Total minutes asleep. Convert from hours yourself — 7h30m is 450."),
    fasting_held: z
      .boolean()
      .optional()
      .describe("True if he held the 12pm–8pm eating window. Writes the 'fasted' rule on the nutrition protocol."),
    meditation_minutes: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe(
        "Total minutes meditated today. This REPLACES the day's total rather than adding to it, so if the timer in the app already logged a sit, pass the combined total.",
      ),
    portfolio: z.number().nonnegative().optional().describe("Investment portfolio value in dollars."),
    date: z.string().optional().describe("ISO date, e.g. '2026-08-29'. Defaults to today."),
  }),
  async execute({ steps, sleep_minutes, fasting_held, meditation_minutes, portfolio, date }) {
    const sql = getDb();
    const day = date ?? dayKey(new Date());

    const patch: Record<string, number> = {};
    if (steps !== undefined) patch.steps = steps;
    if (sleep_minutes !== undefined) patch.sleep_minutes = sleep_minutes;
    if (portfolio !== undefined) patch.portfolio = portfolio;
    if (Object.keys(patch).length) await recordMetrics(sql, day, patch);
    if (fasting_held !== undefined) await setFastingHeld(sql, day, fasting_held);
    if (meditation_minutes !== undefined) await setMeditation(sql, day, meditation_minutes);

    return { date: day, steps, sleep_minutes, fasting_held, meditation_minutes, portfolio };
  },
  toModelOutput(output) {
    const parts: string[] = [];
    if (output.steps !== undefined) parts.push(`${output.steps.toLocaleString("en-CA")} steps`);
    if (output.sleep_minutes !== undefined) {
      const h = Math.floor(output.sleep_minutes / 60);
      const m = output.sleep_minutes % 60;
      parts.push(`${m ? `${h}h ${m}m` : `${h}h`} sleep`);
    }
    if (output.fasting_held !== undefined) parts.push(`eating window ${output.fasting_held ? "held" : "broken"}`);
    if (output.meditation_minutes !== undefined) parts.push(`${output.meditation_minutes} min meditation`);
    if (output.portfolio !== undefined) parts.push(`portfolio $${output.portfolio.toLocaleString("en-CA")}`);
    return {
      type: "text",
      value: parts.length ? `Logged for ${output.date}: ${parts.join(", ")}.` : `Nothing to log for ${output.date}.`,
    };
  },
});

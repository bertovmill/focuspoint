import { defineTool } from "eve/tools";
import { z } from "zod";
import { createReminder, describeReminder, explainScheduleError } from "../../lib/reminders";

export default defineTool({
  description:
    "Set a reminder that pushes a notification to the user's devices at a time in the future, one-off or recurring — on Vercel Schedules, created right now from this conversation. Use it whenever the user says 'remind me', 'nudge me', 'ping me at/on/every', or when you decide a follow-up deserves a nudge later. Times are Toronto local time. For a one-off pass `at` as YYYY-MM-DDTHH:mm (work it out from today's date in the snapshot); for recurring pass a 5-field `cron`. Not Google Calendar: that's add_calendar_event. Tell the user the reminder name back so they can cancel it.",
  inputSchema: z.object({
    message: z.string().min(1).max(200).describe("What the notification says, in the user's words, e.g. 'Follow up with Sam about the intro'"),
    at: z.string().optional().describe("One-off: Toronto local time as YYYY-MM-DDTHH:mm, no timezone suffix. Exactly one of at / cron."),
    cron: z.string().optional().describe("Recurring: 5-field cron in Toronto time, e.g. '0 9 * * 1-5' for weekdays 9am. Exactly one of at / cron."),
    url: z.string().optional().describe("App path the notification opens, e.g. '/tasks'. Defaults to home."),
    todo_id: z.number().int().optional().describe("The todo this reminder is about, if any"),
  }),
  async execute({ message, at, cron, url, todo_id }) {
    try {
      const s = await createReminder({ message, at, cron, url, todo_id });
      return { ok: true as const, reminder: describeReminder(s) };
    } catch (err) {
      return { ok: false as const, error: explainScheduleError(err) };
    }
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: `Could not set the reminder: ${output.error}` };
    const r = output.reminder;
    return {
      type: "text",
      value: `Reminder set (name: ${r.name}) — "${r.message}", ${r.when} ${r.timezone}.`,
    };
  },
});

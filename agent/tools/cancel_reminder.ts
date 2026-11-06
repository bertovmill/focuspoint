import { defineTool } from "eve/tools";
import { z } from "zod";
import { cancelReminder, explainScheduleError } from "../../lib/reminders";

export default defineTool({
  description:
    "Cancel a reminder set with schedule_reminder, by its name (from list_reminders or the confirmation when it was set). Use when the user says to drop, cancel or stop a reminder.",
  inputSchema: z.object({
    name: z.string().min(1).describe("The reminder's schedule name, e.g. 'follow-up-with-sam-m3k9z1'"),
  }),
  async execute({ name }) {
    try {
      await cancelReminder(name);
      return { ok: true as const, name };
    } catch (err) {
      return { ok: false as const, error: explainScheduleError(err) };
    }
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: output.ok ? `Reminder ${output.name} cancelled.` : `Could not cancel: ${output.error}`,
    };
  },
});

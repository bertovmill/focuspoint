import { defineTool } from "eve/tools";
import { z } from "zod";
import { describeReminder, explainScheduleError, listReminders } from "../../lib/reminders";

export default defineTool({
  description:
    "List the reminders Cael has scheduled on Vercel Schedules (one-off and recurring push nudges set with schedule_reminder). Use when the user asks what reminders are set, or before cancelling one.",
  inputSchema: z.object({}),
  async execute() {
    try {
      const all = await listReminders();
      return { ok: true as const, reminders: all.map(describeReminder) };
    } catch (err) {
      return { ok: false as const, error: explainScheduleError(err) };
    }
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: `Could not list reminders: ${output.error}` };
    if (output.reminders.length === 0) return { type: "text", value: "No reminders scheduled." };
    const lines = output.reminders.map(
      (r) => `- ${r.name}: "${r.message}" — ${r.when} (${r.state})${r.todo_id ? ` · todo ${r.todo_id}` : ""}`,
    );
    return { type: "text", value: lines.join("\n") };
  },
});

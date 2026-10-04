import { defineTool } from "eve/tools";
import { z } from "zod";
import { weekDraftContext } from "../../../../lib/training";

export default defineTool({
  description:
    "Read the brief for one training week: his goal, written plan, weekly routine, races ahead, recent Fitbit load, recent notes, and every session already on the week with its id and whether it's done. Call this first.",
  inputSchema: z.object({
    week_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("Monday of the week, ISO date"),
    sessions_per_week: z.number().int().min(3).max(7).optional().describe("Training sessions to plan. Defaults to 6."),
  }),
  async execute({ week_start, sessions_per_week }) {
    return { brief: await weekDraftContext(week_start, sessions_per_week ?? 6) };
  },
  toModelOutput(output) {
    return { type: "text", value: output.brief };
  },
});

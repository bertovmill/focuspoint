import { defineTool } from "eve/tools";
import { z } from "zod";
import { syncWorkouts } from "../../lib/training";

export default defineTool({
  description:
    "Pull Berto's recent Fitbit workouts (runs, gym sessions — with distance, time, average heart rate, heart-rate zones and Active Zone Minutes) into the app and mark matching planned training sessions done. Call this before reporting on this week's training if the plan looks behind, or when he says he just finished a run or workout that should show up.",
  inputSchema: z.object({
    days: z.number().int().min(1).max(60).optional().describe("How far back to pull. Defaults to 14."),
  }),
  async execute({ days }) {
    return syncWorkouts(days ?? 14);
  },
  toModelOutput(output) {
    if (!output.connected) return { type: "text", value: "His watch isn't connected — the Google Health connect is on the home scorecard." };
    return { type: "text", value: `Synced ${output.fetched} workouts; ${output.matched} planned session(s) marked done.` };
  },
});

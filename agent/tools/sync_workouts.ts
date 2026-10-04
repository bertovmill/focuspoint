import { defineTool } from "eve/tools";
import { z } from "zod";
import { syncWorkouts } from "../../lib/training";

export default defineTool({
  description:
    "Pull Berto's recent Fitbit workouts (runs, gym sessions — with distance, time, average heart rate, heart-rate zones and Active Zone Minutes) into the app and attach the heart rate to sessions he has ticked done. It never ticks sessions and never sets distance or time — he ticks them and types in distance + pace himself (the watch's distance runs short).",
  inputSchema: z.object({
    days: z.number().int().min(1).max(60).optional().describe("How far back to pull. Defaults to 14."),
  }),
  async execute({ days }) {
    return syncWorkouts(days ?? 14);
  },
  toModelOutput(output) {
    if (!output.connected) return { type: "text", value: "His watch isn't connected — the Google Health connect is on the home scorecard." };
    return { type: "text", value: `Synced ${output.fetched} workouts; ${output.matched} ticked session(s) got heart rate.` };
  },
});

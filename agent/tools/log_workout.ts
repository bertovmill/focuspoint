import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

const EXERCISES = ["squat", "deadlift", "bench", "chinups", "10k_run", "gym_hours"] as const;

export default defineTool({
  description:
    "Log today's (or a given day's) number for one of the user's 6 standard workouts: squat, deadlift, bench, chinups (all top-set weight in lbs for a 5x5), 10k_run (time in minutes), or gym_hours (total hours spent working out that day — powers the Wellness wealth-form goal on the Home dashboard, currently 1000 hrs/year). Re-logging the same exercise on the same day overwrites that day's number (for gym_hours, log the day's total, not each session separately).",
  inputSchema: z.object({
    exercise: z.enum(EXERCISES),
    value: z.number().positive().describe("Weight in lbs for squat/deadlift/bench/chinups, time in minutes for 10k_run, or hours for gym_hours"),
    date: z.string().optional().describe("ISO date string, e.g. '2026-08-07'. Defaults to today."),
  }),
  async execute({ exercise, value, date }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO workout_logs (exercise, value, logged_date)
      VALUES (${exercise}, ${value}, ${date ?? new Date().toISOString().slice(0, 10)})
      ON CONFLICT (exercise, logged_date) DO UPDATE SET value = EXCLUDED.value
      RETURNING exercise, value, logged_date
    `;
    return row;
  },
  toModelOutput(output) {
    const unit = output.exercise === "10k_run" ? "min" : output.exercise === "gym_hours" ? "hrs" : "lbs";
    return { type: "text", value: `Logged ${output.exercise}: ${output.value} ${unit} on ${output.logged_date}.` };
  },
});

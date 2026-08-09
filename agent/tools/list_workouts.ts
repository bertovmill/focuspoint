import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List logged history for the user's 6 standard workouts (squat, deadlift, bench, chinups, 10k_run, gym_hours), optionally filtered to one exercise. Use this to answer questions about training progress.",
  inputSchema: z.object({
    exercise: z.enum(["squat", "deadlift", "bench", "chinups", "10k_run", "gym_hours"]).optional(),
    limit: z.number().int().min(1).max(200).default(60),
  }),
  async execute({ exercise, limit }) {
    const sql = getDb();
    const rows = exercise
      ? await sql`
          SELECT exercise, value, logged_date
          FROM workout_logs
          WHERE exercise = ${exercise}
          ORDER BY logged_date DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT exercise, value, logged_date
          FROM workout_logs
          ORDER BY logged_date DESC
          LIMIT ${limit}
        `;
    return { logs: rows };
  },
  toModelOutput(output) {
    if (output.logs.length === 0) return { type: "text", value: "No workouts logged yet." };
    const value = output.logs
      .map((l) => `${l.logged_date}: ${l.exercise} ${l.value}${l.exercise === "10k_run" ? "min" : l.exercise === "gym_hours" ? "hrs" : "lbs"}`)
      .join("\n");
    return { type: "text", value };
  },
});

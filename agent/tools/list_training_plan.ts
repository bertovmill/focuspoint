import { defineTool } from "eve/tools";
import { z } from "zod";
import { addDaysISO, todayISO, weekStartISO } from "../../lib/nutrition";
import { daysUntil, getActivities, getEvents, getSessions } from "../../lib/training";
import { isHealthConnected } from "../../lib/google-health";

export default defineTool({
  description:
    "Read Berto's training plan from /training: the races he's building toward (with days to go), this week's planned sessions (long runs, Hyrox/hybrid, strength, intervals, easy, rest) and whether each was done, and his recent Fitbit workouts (with average heart rate and Active Zone Minutes). Use before answering anything about training load, what's next, or when planning sessions.",
  inputSchema: z.object({
    week_start: z.string().optional().describe("Monday of the week to read, ISO date. Defaults to the current week."),
    activity_days: z.number().int().min(1).max(60).optional().describe("How many days of Fitbit workouts to include. Defaults to 14."),
  }),
  async execute({ week_start, activity_days }) {
    const start = week_start ?? weekStartISO(todayISO());
    const end = addDaysISO(start, 6);
    const days = activity_days ?? 14;
    const [events, sessions, activities, connected] = await Promise.all([
      getEvents(),
      getSessions(start, end),
      getActivities(addDaysISO(todayISO(), -days), todayISO()),
      isHealthConnected().catch(() => false),
    ]);
    return {
      week_start: start,
      races: events.map((e) => ({ ...e, days_to_go: daysUntil(e.event_date) })),
      sessions,
      watch_connected: connected,
      activities: activities.map((a) => ({
        date: a.start_local.slice(0, 10),
        name: a.name,
        sport: a.sport_type,
        km: Math.round(a.distance_m / 100) / 10,
        minutes: Math.round(a.moving_time_s / 60),
        avg_hr: a.avg_hr,
        active_zone_minutes: a.azm,
      })),
    };
  },
});

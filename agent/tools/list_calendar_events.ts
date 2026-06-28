import { defineTool } from "eve/tools";
import { z } from "zod";

import {
  CALENDAR_NOT_CONNECTED,
  googleCalendarAuth,
  listCalendarEvents,
  resolveGoogleToken,
} from "../lib/google-calendar.js";

export default defineTool({
  description:
    "Read upcoming events from the user's Google Calendar within a date range. Use this to check what's on the schedule — e.g. when building a daily digest, answering 'what's on my calendar', or finding a free slot.",
  inputSchema: z.object({
    start_date: z
      .string()
      .describe("Start of the range, ISO date e.g. '2026-06-28'. Defaults to today if omitted."),
    end_date: z
      .string()
      .optional()
      .describe("End of the range, ISO date. Defaults to the same day as start_date (just that day)."),
    max_results: z.number().int().max(50).default(20).describe("Maximum number of events to return."),
  }),
  async execute({ start_date, end_date, max_results }, ctx) {
    const token = await resolveGoogleToken(ctx);
    if (!token) return { success: false, message: CALENDAR_NOT_CONNECTED };

    const end = end_date ?? start_date;
    const timeMin = new Date(`${start_date}T00:00:00`).toISOString();
    const timeMax = new Date(`${end}T23:59:59`).toISOString();

    const result = await listCalendarEvents(token, { timeMin, timeMax, maxResults: max_results });

    if (!result.success && result.status === 401) ctx.requireAuth(googleCalendarAuth);
    if (!result.success) return { success: false, message: `Calendar API error: ${result.message}` };

    return { success: true, count: result.events.length, events: result.events };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed to read calendar." };
    if (output.count === 0) return { type: "text" as const, value: "No events found in that range." };
    const lines = (output.events ?? []).map((e) =>
      e.allDay
        ? `• ${e.start} (all day) — ${e.title}${e.location ? ` @ ${e.location}` : ""}`
        : `• ${e.start} — ${e.title}${e.location ? ` @ ${e.location}` : ""}`,
    );
    return { type: "text" as const, value: lines.join("\n") };
  },
});

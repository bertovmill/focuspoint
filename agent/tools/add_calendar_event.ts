import { defineTool } from "eve/tools";
import { once } from "eve/tools/approval";
import { z } from "zod";

import {
  CALENDAR_NOT_CONNECTED,
  createCalendarEvent,
  googleCalendarAuth,
  resolveGoogleToken,
} from "../lib/google-calendar.js";

export default defineTool({
  description:
    "Add an event or reminder to the user's Google Calendar. Use this when the user says 'remind me', 'schedule', 'add to my calendar', or similar.",
  inputSchema: z.object({
    title: z.string().describe("Event title"),
    date: z.string().describe("ISO date string, e.g. '2026-06-30'"),
    time: z.string().optional().describe("24h time string, e.g. '14:30'. Omit for all-day events."),
    duration_minutes: z.number().int().default(30).describe("Duration in minutes (ignored for all-day events)"),
    description: z.string().optional().describe("Optional event description or notes"),
  }),
  // Writing to the real calendar is an outward action — confirm once per session.
  approval: once(),
  async execute({ title, date, time, duration_minutes, description }, ctx) {
    const token = await resolveGoogleToken(ctx);
    if (!token) return { success: false, message: CALENDAR_NOT_CONNECTED };

    const result = await createCalendarEvent(token, {
      title,
      date,
      time,
      durationMinutes: duration_minutes,
      description,
    });

    // Token rejected since it was resolved: re-challenge through Connect.
    if (!result.success && result.status === 401) ctx.requireAuth(googleCalendarAuth);

    if (!result.success) return { success: false, message: `Calendar API error: ${result.message}` };
    return { success: true, eventId: result.eventId, link: result.link };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed to add event." };
    return { type: "text" as const, value: `Event added to Google Calendar.` };
  },
});

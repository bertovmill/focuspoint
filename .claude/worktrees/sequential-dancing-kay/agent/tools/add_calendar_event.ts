import { defineTool } from "eve/tools";
import { z } from "zod";

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
  async execute({ title, date, time, duration_minutes, description }) {
    const accessToken = process.env.GOOGLE_CALENDAR_ACCESS_TOKEN;
    if (!accessToken) {
      return {
        success: false,
        message:
          "Google Calendar is not connected yet. To connect it, add GOOGLE_CALENDAR_ACCESS_TOKEN to your environment variables.",
      };
    }

    const isAllDay = !time;
    const start = isAllDay ? { date } : { dateTime: `${date}T${time}:00`, timeZone: "America/Toronto" };
    const end = isAllDay
      ? { date }
      : {
          dateTime: new Date(
            new Date(`${date}T${time}:00`).getTime() + duration_minutes * 60000,
          ).toISOString(),
          timeZone: "America/Toronto",
        };

    const res = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary/events",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ summary: title, description, start, end }),
      },
    );

    if (!res.ok) {
      const err = await res.text();
      return { success: false, message: `Calendar API error: ${err}` };
    }

    const event = await res.json();
    return { success: true, eventId: event.id, link: event.htmlLink };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed to add event." };
    return { type: "text" as const, value: `Event added to Google Calendar.` };
  },
});

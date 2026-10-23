import { defineTool } from "eve/tools";
import { once } from "eve/tools/approval";
import { z } from "zod";

import {
  CALENDAR_NOT_CONNECTED,
  createCalendarEvent,
  resolveGoogleToken,
} from "../lib/google-calendar";

function fromText(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return v.split(",").map((x) => x.trim()).filter(Boolean);
  }
}

export default defineTool({
  description:
    "Add an event or reminder to the user's Google Calendar. Use this when the user says 'remind me', 'schedule', 'add to my calendar', or similar.",
  inputSchema: z.object({
    title: z.string().describe("Event title"),
    date: z.string().describe("ISO date string, e.g. '2026-06-30'"),
    time: z.string().optional().describe("24h time string, e.g. '14:30'. Omit for all-day events."),
    duration_minutes: z.number().int().default(30).describe("Duration in minutes (ignored for all-day events)"),
    description: z.string().optional().describe("Optional event description or notes"),
    // Arrays are also accepted as a string (JSON or comma-separated): MCP clients
    // with an older cached schema send unknown fields as text.
    recurrence: z
      .preprocess(fromText, z.array(z.string()))
      .optional()
      .describe("Optional RFC 5545 rules to make it repeat, e.g. ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'] for every weekday"),
    popup_minutes: z
      .preprocess(fromText, z.array(z.coerce.number().int().min(0)))
      .optional()
      .describe("Optional pop-up reminders in minutes before the start, e.g. [5, 0]. Omit for the calendar's defaults."),
  }),
  // Writing to the real calendar is an outward action — confirm once per session.
  approval: once(),
  async execute({ title, date, time, duration_minutes, description, recurrence, popup_minutes }) {
    const token = await resolveGoogleToken();
    if (!token) return { success: false, message: CALENDAR_NOT_CONNECTED };

    const result = await createCalendarEvent(token, {
      title,
      date,
      time,
      durationMinutes: duration_minutes,
      description,
      recurrence,
      popupMinutes: popup_minutes,
    });

    if (!result.success) return { success: false, message: `Calendar API error: ${result.message}` };
    return { success: true, eventId: result.eventId, link: result.link };
  },
  toModelOutput(output) {
    if (!output.success) return { type: "text" as const, value: output.message ?? "Failed to add event." };
    return { type: "text" as const, value: `Event added to Google Calendar.` };
  },
});

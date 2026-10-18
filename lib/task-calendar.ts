import { gcalFetch } from "@/lib/google";
import { buildDoneBlock, type CompletedTaskForCalendar } from "@/lib/done-block";

// Web-side wiring for plotting completed tasks onto the primary Google Calendar.
// Every function here is best-effort: a Google failure (not connected, revoked
// token, API blip) must never stop a task from being completed or uncompleted.

/**
 * Writes the completed task onto the calendar, ending at `completedAt` and
 * starting one duration earlier. Returns the Google event id to store on the
 * todo, or null if nothing was written.
 */
export async function logCompletedTaskToCalendar(
  todo: CompletedTaskForCalendar,
  completedAt: Date = new Date(),
): Promise<string | null> {
  try {
    const res = await gcalFetch(`/calendars/primary/events`, {
      method: "POST",
      body: JSON.stringify(buildDoneBlock(todo, completedAt)),
    });
    if (!res.ok) {
      console.error(`Calendar log failed: ${res.status} ${await res.text()}`);
      return null;
    }
    const event: { id?: string } = await res.json();
    return event.id ?? null;
  } catch (err) {
    // Not connected, revoked token, network blip — completing the task still wins.
    console.error("Calendar log failed:", err);
    return null;
  }
}

/** Removes a previously logged done-block. Silent about anything that goes wrong. */
export async function removeCompletedTaskFromCalendar(eventId: string | null | undefined) {
  if (!eventId) return;
  try {
    const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
    });
    // 404/410 = already gone, which is the outcome we wanted anyway.
    if (!res.ok && res.status !== 404 && res.status !== 410) {
      console.error(`Calendar unlog failed: ${res.status} ${await res.text()}`);
    }
  } catch (err) {
    console.error("Calendar unlog failed:", err);
  }
}

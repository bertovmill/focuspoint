import { defineTool } from "eve/tools";
import { z } from "zod";
import { lastLumaSync, syncLuma } from "../../lib/luma-sync.js";

/**
 * Refresh the Luma mirror on demand.
 *
 * The daily dispatcher already re-pulls everything (agent/schedules/dispatcher.ts),
 * so this is for the moments in between — a new event was just published, or
 * signups moved since this morning.
 */
export default defineTool({
  description:
    "Re-pull Berto's Luma calendar (events, guests, audience) into the database. Use when event data looks stale or something was just published on Luma. Takes ~30s; check_only reports when it last ran without re-pulling.",
  inputSchema: z.object({
    check_only: z.boolean().default(false).describe("Just report the last sync instead of running one."),
  }),
  async execute({ check_only }) {
    if (check_only) return { ran: false as const, last: await lastLumaSync() };
    const counts = await syncLuma();
    return { ran: true as const, ...counts };
  },
  toModelOutput(output) {
    if (!output.ran) {
      const last = output.last;
      return {
        type: "text",
        value: last
          ? `Last Luma sync: ${last.finished_at} — ${last.events} events, ${last.guests} guests, ${last.people} people.`
          : "Luma has never been synced.",
      };
    }
    return {
      type: "text",
      value: `Synced Luma: ${output.events} events, ${output.guests} guest registrations, ${output.people} people.`,
    };
  },
});

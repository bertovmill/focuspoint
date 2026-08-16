import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

/**
 * The MakersLounge calendar, from Cael's own mirror of Luma (see lib/luma-sync.ts).
 * Reads the database, never the Luma API, so it's instant and works when Luma
 * doesn't — call `sync_luma` first if something looks out of date.
 */
export default defineTool({
  description:
    "List Berto's Luma events (MakersLounge) with dates, venue, signups and turnout. Use this for anything about events — writing a newsletter, planning the next meetup, or recalling how the last one went. Defaults to upcoming events.",
  inputSchema: z.object({
    when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  async execute({ when, limit }) {
    const sql = getDb();
    // Written out per branch rather than composed: the Neon driver takes values,
    // not SQL fragments, so a dynamic ORDER BY can't be interpolated.
    const rows =
      when === "upcoming"
        ? await sql`
            SELECT api_id, name, url, start_at, address, location_type,
                   guest_count, approved_count, checked_in_count, spots_remaining, registration_open
            FROM luma_events WHERE start_at >= NOW()
            ORDER BY start_at ASC LIMIT ${limit}
          `
        : when === "past"
          ? await sql`
              SELECT api_id, name, url, start_at, address, location_type,
                     guest_count, approved_count, checked_in_count, spots_remaining, registration_open
              FROM luma_events WHERE start_at < NOW()
              ORDER BY start_at DESC LIMIT ${limit}
            `
          : await sql`
              SELECT api_id, name, url, start_at, address, location_type,
                     guest_count, approved_count, checked_in_count, spots_remaining, registration_open
              FROM luma_events
              ORDER BY start_at DESC LIMIT ${limit}
            `;
    return { when, events: rows };
  },
  toModelOutput(output) {
    if (output.events.length === 0) {
      return { type: "text", value: `No ${output.when} Luma events in the mirror. If that seems wrong, run sync_luma.` };
    }
    const value = output.events
      .map((e) => {
        const date = e.start_at ? new Date(String(e.start_at)).toISOString().slice(0, 16).replace("T", " ") : "date TBC";
        const where = e.address ?? e.location_type ?? "location TBC";
        const turnout =
          e.checked_in_count > 0
            ? `${e.guest_count} registered, ${e.checked_in_count} checked in`
            : `${e.guest_count} registered`;
        return `${date} — ${e.name} (${where}) — ${turnout}\n  ${e.url}`;
      })
      .join("\n");
    return { type: "text", value };
  },
});

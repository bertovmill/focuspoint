import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

/**
 * One event in full — including the description Berto wrote on Luma, which is
 * the single most useful thing to have in front of you when drafting a
 * newsletter about it.
 *
 * Matched by name rather than id: the agent is talking to a person who says
 * "MakersLounge #8", not "evt-XFOBcAemtEsl5tT".
 */
export default defineTool({
  description:
    "Get one Luma event in full: its description, venue, time, link, and turnout (registered / approved / checked in). Match by part of the event name, e.g. 'MakersLounge #8'. Use this when writing about a specific event.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Part of the event name, case-insensitive."),
  }),
  async execute({ name }) {
    const sql = getDb();
    const [event] = await sql`
      SELECT api_id, name, description_md, description, url, start_at, end_at, timezone,
             address, location_type, guest_count, approved_count, checked_in_count,
             spots_remaining, registration_open, hosts
      FROM luma_events
      WHERE name ILIKE ${"%" + name + "%"}
      ORDER BY start_at DESC
      LIMIT 1
    `;
    if (!event) return { found: false as const, name };

    // Where the signups came from — useful for "what actually filled the room".
    const sources = await sql`
      SELECT COALESCE(source, 'direct') AS source, COUNT(*)::int AS n
      FROM luma_guests WHERE event_api_id = ${event.api_id}
      GROUP BY 1 ORDER BY n DESC LIMIT 5
    `;
    return { found: true as const, event, sources };
  },
  toModelOutput(output) {
    if (!output.found) {
      return { type: "text", value: `No Luma event matching "${output.name}". Try list_luma_events to see what's there.` };
    }
    const e = output.event;
    const when = e.start_at ? new Date(String(e.start_at)).toISOString().slice(0, 16).replace("T", " ") : "date TBC";
    const lines = [
      `${e.name}`,
      `When: ${when} (${e.timezone ?? "local"})`,
      `Where: ${e.address ?? e.location_type ?? "TBC"}`,
      `Link: ${e.url}`,
      `Turnout: ${e.guest_count} registered · ${e.approved_count} approved · ${e.checked_in_count} checked in`,
      e.spots_remaining != null ? `Spots remaining: ${e.spots_remaining}` : "",
      output.sources.length ? `Signup sources: ${output.sources.map((s) => `${s.source} ${s.n}`).join(", ")}` : "",
      "",
      "Description:",
      String(e.description_md ?? e.description ?? "(none)"),
    ].filter(Boolean);
    return { type: "text", value: lines.join("\n") };
  },
});

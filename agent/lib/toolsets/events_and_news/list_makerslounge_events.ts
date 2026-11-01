import { defineTool } from "eve/tools";
import { z } from "zod";
import { listMakersLoungeEvents } from "../../../../lib/makerslounge";

/**
 * Every MakersLounge event, read live through makerslounge.ca's admin API: the
 * ones run on the site since Nov 2026 and the Luma history imported into it,
 * with real check-ins for both, in one list.
 */
export default defineTool({
  description:
    "List MakersLounge events from makerslounge.ca, past and upcoming, with RSVPs and check-ins (who showed up) per event, plus community totals: members, events run, RSVPs, check-ins, distinct people. Covers events run on the site since Nov 2026 and the earlier Luma events imported into it. Use this first for anything about MakersLounge events, turnout or community numbers.",
  inputSchema: z.object({
    when: z.enum(["upcoming", "past", "all"]).default("upcoming"),
    limit: z.number().int().min(1).max(100).default(10),
  }),
  async execute({ when, limit }) {
    const { totals, events } = await listMakersLoungeEvents(when, limit);
    return { when, totals, events };
  },
  toModelOutput(output) {
    const t = output.totals;
    const header =
      `MakersLounge totals: ${t.members} site members; ${t.events_run} events run (${t.luma_events} on Luma, ` +
      `${t.site_events_run} on makerslounge.ca), ${t.events_upcoming} upcoming; ${t.rsvps_total} RSVPs ` +
      `(${t.luma_people_registered} distinct people on Luma); ${t.check_ins} check-ins ` +
      `(${t.site_check_ins} on makerslounge.ca, ${t.luma_check_ins} on Luma; ${t.luma_people_checked_in} distinct people on Luma).`;
    if (output.events.length === 0) {
      return { type: "text", value: `${header}\nNo ${output.when} events on makerslounge.ca.` };
    }
    const lines = output.events.map((e) => {
      const when = new Date(e.start_time).toLocaleString("en-CA", {
        timeZone: "America/Toronto",
        dateStyle: "medium",
        timeStyle: "short",
      });
      const cap = e.capacity ? ` of ${e.capacity}` : "";
      return `${when} — ${e.title} [${e.source}] (${e.location ?? "location TBC"}) — ${e.rsvps}${cap} RSVPs, ${e.check_ins} checked in${e.walk_ins ? ` (${e.walk_ins} walk-ins)` : ""}\n  ${e.url}`;
    });
    return { type: "text", value: `${header}\n${lines.join("\n")}` };
  },
});

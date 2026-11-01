import { defineTool } from "eve/tools";
import { z } from "zod";
import { listMakersLoungeEvents } from "../../../../lib/makerslounge";

/**
 * MakersLounge events as they are now: run on makerslounge.ca (own RSVP and
 * guest list), read live through the site's admin API. Luma only holds the
 * history from before Nov 2026.
 */
export default defineTool({
  description:
    "List MakersLounge events from makerslounge.ca (where events run since Nov 2026), with RSVP and check-in counts per event, plus community totals: members, events run, RSVPs, check-ins. Use this first for anything about MakersLounge events, turnout or community numbers. For events before Nov 2026 use list_luma_events.",
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
    const checkIns = (n: number | null) => (n === null ? "check-ins not tracked yet" : `${n} checked in`);
    const header =
      `makerslounge.ca totals: ${t.members} members, ${t.events_run} events run, ${t.events_upcoming} upcoming, ` +
      `${t.rsvps_total} RSVPs (${t.rsvps_past} to past events), ${checkIns(t.check_ins)}.`;
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
      return `${when} — ${e.title} (${e.location ?? "location TBC"}) — ${e.rsvps}${cap} RSVPs, ${checkIns(e.check_ins)} [id ${e.id}]\n  ${e.url}`;
    });
    return { type: "text", value: `${header}\n${lines.join("\n")}` };
  },
});

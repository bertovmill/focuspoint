import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMakersLoungeGuests, listMakersLoungeEvents } from "../../../../lib/makerslounge";

/**
 * One makerslounge.ca event with its guest list: who RSVPed and what they're
 * building, which is what intros at a meetup are grouped by. Names only; emails
 * stay on the site.
 */
export default defineTool({
  description:
    "Get one MakersLounge event from makerslounge.ca with its guest list: each guest's name, what they're building, and whether they're a site member, plus RSVP and check-in counts. Match by part of the title or the slug, e.g. 'Nov 7' or 'makerslounge-saturdays-2026-11-07'.",
  inputSchema: z.object({
    event: z.string().min(1).describe("Part of the event title, its slug, or its id."),
  }),
  async execute({ event }) {
    const { events } = await listMakersLoungeEvents("all", 100);
    const q = event.toLowerCase();
    const match = events.find(
      (e) => e.id === event || e.slug === event || e.title.toLowerCase().includes(q) || e.slug?.includes(q),
    );
    if (!match) return { found: false as const, event };
    const guests = await getMakersLoungeGuests(match.id);
    return { found: true as const, event: match, guests };
  },
  toModelOutput(output) {
    if (!output.found) {
      return { type: "text", value: `No makerslounge.ca event matches "${output.event}". Try list_makerslounge_events.` };
    }
    const e = output.event;
    const checkIns = e.check_ins === null ? "check-ins not tracked yet" : `${e.check_ins} checked in`;
    const guests =
      output.guests.length === 0
        ? "No RSVPs yet."
        : output.guests
            .map((g) => `- ${g.name}${g.building ? `: ${g.building}` : ""}${g.member ? " (member)" : ""}`)
            .join("\n");
    return {
      type: "text",
      value: `${e.title} — ${e.start_time} — ${e.location ?? "location TBC"}\n${e.url}\n${e.rsvps} RSVPs, ${checkIns}\n${guests}`,
    };
  },
});

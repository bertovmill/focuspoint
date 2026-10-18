import { defineDynamic, defineInstructions } from "eve/instructions";

import { buildDailySnapshot, snapshotMarker } from "../lib/daily-snapshot";
import { todayISO } from "../lib/now";

// Pins today's brief (principles, training, food, calendar, todos) into the
// conversation as a user-role message, once per day of a session: on its first turn, and again on the first turn after midnight in a
// conversation that runs for days. User-role, not system, so it joins the
// append-only history and never invalidates the provider's cached prefix.
// If compaction summarised the last one away, the marker is gone and a fresh
// brief goes in on the next turn.
export default defineDynamic({
  events: {
    "turn.started": async (_event, ctx) => {
      const marker = snapshotMarker(todayISO());
      const alreadyIn = ctx.messages.some((m) =>
        (typeof m.content === "string" ? m.content : JSON.stringify(m.content)).includes(marker),
      );
      if (alreadyIn) return null;
      const content = await buildDailySnapshot();
      return content ? defineInstructions({ content, role: "user" }) : null;
    },
  },
});

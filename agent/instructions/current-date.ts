import { defineDynamic, defineInstructions } from "eve/instructions";

import { nowHuman, todayISO } from "../lib/now";

// The model doesn't know what day it is. Give it the real date/time at the
// start of every turn so "today", "tomorrow", and date-relative calendar queries
// come out right in long or resumed sessions. It goes in as a short user-role
// line rather than system context: a timestamp that changes every turn inside
// the system prompt would invalidate the provider's prompt cache on every turn.
export default defineDynamic({
  events: {
    "turn.started": () =>
      defineInstructions({
        role: "user",
        content: `[[Now: ${nowHuman()} — today is ${todayISO()}. Use this for any date reasoning; never guess the date.]]`,
      }),
  },
});

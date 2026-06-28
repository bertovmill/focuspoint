import { defineDynamic, defineInstructions } from "eve/instructions";

import { nowHuman, todayISO } from "../lib/now.js";

// The model doesn't know what day it is. Inject the real current date/time
// every turn so Cael reasons about "today", "tomorrow", and date-relative
// calendar queries correctly. Resolves on turn.started so a long-running or
// resumed session always sees a fresh date.
export default defineDynamic({
  events: {
    "turn.started": () =>
      defineInstructions({
        markdown: [
          `# Current date`,
          ``,
          `Right now it is **${nowHuman()}**. Today's date is **${todayISO()}** (ISO).`,
          `Use this for any date reasoning — "today", "tomorrow", "this week",`,
          `and when calling calendar tools. Never guess the date.`,
        ].join("\n"),
      }),
  },
});

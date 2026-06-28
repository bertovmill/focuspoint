import { defineTool } from "eve/tools";
import { z } from "zod";

import { sessionMemory } from "../lib/session-state.js";

export default defineTool({
  description:
    "Record what the user wants to focus on for this conversation/session. Call this when the user states an intention like 'today I want to focus on X' or 'help me work on Y'. Lets Cael keep the thread of the session in mind.",
  inputSchema: z.object({
    focus: z.string().describe("A short phrase describing the session's focus, e.g. 'shipping the launch'."),
  }),
  async execute({ focus }) {
    sessionMemory.update((s) => ({ ...s, focus }));
    return { focus };
  },
  toModelOutput({ focus }) {
    return { type: "text" as const, value: `Holding "${focus}" as our focus for now.` };
  },
});

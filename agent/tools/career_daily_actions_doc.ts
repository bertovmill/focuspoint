import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCareerDailyActions, setCareerDailyActions } from "../../lib/career-daily-actions";

export default defineTool({
  description:
    "Read or rewrite Berto's career daily actions — the markdown list on /career (#daily-actions), right under his career principles: the small things he does each day (send one message, make it a give, engage once, log a proof point, update Relationships) to make those principles true. Call with no content to read it. To change it, read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment. Keep his wording; don't add actions he hasn't asked for.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setCareerDailyActions(content)), wrote: true };
    return { ...(await getCareerDailyActions()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Career daily actions updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The career daily actions document is empty." };
  },
});

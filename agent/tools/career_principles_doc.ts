import { defineTool } from "eve/tools";
import { z } from "zod";
import { getCareerPrinciples, setCareerPrinciples } from "../../lib/career-principles";

export default defineTool({
  description:
    "Read or rewrite Berto's career principles — the markdown list at the top of /career (#principles) for how he lines up his next role while still at the startup: build the network early, give first, warm vs active mode, and so on. Call with no content to read it. To change it, read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment. Keep his wording; don't add principles he hasn't asked for.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setCareerPrinciples(content)), wrote: true };
    return { ...(await getCareerPrinciples()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Career principles updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The career principles document is empty." };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getPrinciples, setPrinciples } from "../../lib/principles";

export default defineTool({
  description:
    "Read or rewrite Berto's principles — the markdown document at the bottom of the Home screen, the rules he has chosen to live and work by. Call with no content to read it. To change it (add a principle he states, reword one, reorder), read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment. Keep his wording; don't add principles he hasn't asked for. Toggle blocks appear as <details> HTML — keep them intact.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setPrinciples(content)), wrote: true };
    return { ...(await getPrinciples()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Principles updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The principles document is empty." };
  },
});

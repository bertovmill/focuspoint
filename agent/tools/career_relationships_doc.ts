import { defineTool } from "eve/tools";
import { z } from "zod";
import { getRelationships, setRelationships } from "../../lib/career-relationships";

export default defineTool({
  description:
    "Read or rewrite Berto's career relationships page — the markdown doc on /career (#relationships) where he notes the companies and people he's talked to about possibly working together, so he can keep those relationships warm before asking for a role. Call with no content to read it. To add a company, a person or a conversation he tells you about, read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment. Follow the structure already in the doc and keep his wording. Toggle blocks appear as <details> HTML — keep them intact.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setRelationships(content)), wrote: true };
    return { ...(await getRelationships()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Career relationships updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The career relationships page is empty." };
  },
});

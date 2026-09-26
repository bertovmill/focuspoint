import { defineTool } from "eve/tools";
import { z } from "zod";
import { getPlanDoc, setPlanDoc } from "../../lib/training";

export default defineTool({
  description:
    "Read or rewrite Berto's written training plan — the markdown document under the week grid on /training (blocks, weekly structure, the build toward the February Hyrox). Weekly drafts are written against it. Call with no content to read it. To change it, read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setPlanDoc(content)), wrote: true };
    return { ...(await getPlanDoc()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Training plan updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The training plan document is empty." };
  },
});

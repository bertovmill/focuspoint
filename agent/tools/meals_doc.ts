import { defineTool } from "eve/tools";
import { z } from "zod";
import { getMealNotes, setMealNotes } from "../../lib/meal-notes";

export default defineTool({
  description:
    "Read or rewrite Berto's meal notes — the Notion-style markdown page under the week grid on /meals, where he keeps his typical grocery list, pantry staples, go-to meals and anything else about food that isn't tied to one week. Call with no content to read it (do this before planning meals or building a shopping list). To change it (add an item to the grocery list, tick one off, add a go-to meal), read it first, then pass the FULL new markdown — writing replaces the whole document, so never send a fragment. Keep his wording and structure; checklist items are `- [ ]` / `- [x]`. Toggle blocks appear as <details> HTML — keep them intact.",
  inputSchema: z.object({
    content: z.string().optional().describe("The complete new markdown. Omit to just read."),
  }),
  async execute({ content }) {
    if (typeof content === "string") return { ...(await setMealNotes(content)), wrote: true };
    return { ...(await getMealNotes()), wrote: false };
  },
  toModelOutput(output) {
    if (output.wrote) return { type: "text", value: `Meal notes updated (${output.content.length} chars).` };
    return { type: "text", value: output.content.trim() ? output.content : "The meal notes page is empty." };
  },
});

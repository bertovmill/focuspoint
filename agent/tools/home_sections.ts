import { defineTool } from "eve/tools";
import { z } from "zod";
import { createHomeSection, getHomeSection, listHomeSections, updateHomeSection } from "../../lib/home-sections";

export default defineTool({
  description:
    "Read, add or rewrite Berto's own sections at the top of the Home screen — titled markdown pages he adds himself, like his 5-year review and 5-year plan. Call with no arguments to list every section with its full text. To change one, read it first, then pass its id and the FULL new markdown — writing replaces the whole body, so never send a fragment; keep his wording. Pass title (with id) to rename. Pass title without id to add a new section at the bottom. Only add or change sections when he asks. Toggle blocks appear as <details> HTML — keep them intact.",
  inputSchema: z.object({
    id: z.number().int().optional().describe("The section to rewrite or rename, from the list."),
    title: z.string().optional().describe("New title (with id), or the title of a new section (without id)."),
    content: z.string().optional().describe("The complete new markdown body."),
  }),
  async execute({ id, title, content }) {
    if (id === undefined && title?.trim()) {
      return { action: "created" as const, sections: [await createHomeSection(title.trim(), content ?? "")] };
    }
    if (id !== undefined && (title?.trim() || typeof content === "string")) {
      const section = await updateHomeSection(id, { title: title?.trim() || undefined, content });
      if (!section) return { action: "missing" as const, sections: [] };
      return { action: "updated" as const, sections: [section] };
    }
    if (id !== undefined) {
      const section = await getHomeSection(id);
      return { action: "read" as const, sections: section ? [section] : [] };
    }
    return { action: "read" as const, sections: await listHomeSections() };
  },
  toModelOutput(output) {
    if (output.action === "missing") return { type: "text", value: "No section with that id. List the sections first." };
    if (output.action !== "read") {
      const s = output.sections[0];
      return { type: "text", value: `Section ${output.action}: #${s.id} "${s.title}" (${s.content.length} chars).` };
    }
    if (!output.sections.length) return { type: "text", value: "There are no sections on Home yet." };
    return {
      type: "text",
      value: output.sections.map((s) => `## #${s.id} — ${s.title}\n\n${s.content.trim() || "(empty)"}`).join("\n\n"),
    };
  },
});

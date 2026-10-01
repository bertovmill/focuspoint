import { defineTool } from "eve/tools";
import { z } from "zod";
import { CAPABILITIES_URL, slugify, upsertCapability } from "../../lib/portfolio";

export default defineTool({
  description:
    "Create or edit a capability on bertomill.com/capabilities (e.g. 'Evaluation & quality gates'). With a slug that doesn't exist yet it creates one (name required); with an existing slug it changes only the fields passed. Capabilities show on the live page immediately — confirm wording with Berto first. Link projects to it with save_portfolio_project.",
  inputSchema: z.object({
    slug: z.string().optional().describe("Slug of the capability to edit. Omit to create (made from the name)."),
    name: z.string().optional().describe("Short name, e.g. 'RAG & retrieval'. Required when creating."),
    summary: z.string().optional().describe("One or two sentences on what this capability means in practice."),
    sort_order: z.number().int().optional().describe("Lower comes first on the page."),
    new_slug: z.string().optional().describe("Rename the slug (changes the ?capability= filter URL)."),
  }),
  async execute({ slug, name, summary, sort_order, new_slug }) {
    const key = slug ?? slugify(name ?? "");
    if (!key) return { ok: false as const, error: "Pass a slug to edit, or a name to create." };
    try {
      const cap = await upsertCapability(key, {
        name,
        summary,
        sortOrder: sort_order,
        slug: new_slug ? slugify(new_slug) : undefined,
      });
      return { ok: true as const, slug: cap.slug, name: cap.name, url: `${CAPABILITIES_URL}?capability=${cap.slug}` };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: output.error };
    return { type: "text", value: `Saved capability "${output.name}" (slug: ${output.slug}): ${output.url}` };
  },
});

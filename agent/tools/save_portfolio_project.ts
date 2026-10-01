import { defineTool } from "eve/tools";
import { z } from "zod";
import { CAPABILITIES_URL, slugify, upsertProject } from "../../lib/portfolio";

export default defineTool({
  description:
    "Create or edit a project on bertomill.com/capabilities and say which capabilities it proves. With a new slug it creates a DRAFT (name required); with an existing slug it changes only the fields passed. `capabilities` is the project's full list — each entry is a capability slug plus `evidence`: one or two concrete sentences on how this project shows that capability (what was built, not adjectives). Passing it replaces the old list. Set status 'published' only when Berto says so; published projects are live. Call list_portfolio first for slugs.",
  inputSchema: z.object({
    slug: z.string().optional().describe("Slug of the project to edit. Omit to create (made from the name)."),
    name: z.string().optional().describe("Project name, e.g. 'Venice'. Required when creating."),
    summary: z.string().optional().describe("One or two sentences: what it is and who uses it."),
    year: z.string().nullable().optional().describe("e.g. '2026' or '2025 – 2026'. null clears."),
    live_url: z.string().nullable().optional().describe("Where it can be seen running. null clears."),
    repo_url: z.string().nullable().optional().describe("Public source code, if any. null clears."),
    work_slug: z.string().nullable().optional().describe("Slug of a case study at bertomill.com/work/<slug>. null clears."),
    status: z.enum(["draft", "published"]).optional(),
    sort_order: z.number().int().optional().describe("Lower comes first on the page."),
    capabilities: z
      .array(z.object({ slug: z.string(), evidence: z.string() }))
      .optional()
      .describe("The full set of capabilities this project proves. Replaces the existing links."),
    new_slug: z.string().optional().describe("Rename the project's slug."),
  }),
  async execute({ slug, name, summary, year, live_url, repo_url, work_slug, status, sort_order, capabilities, new_slug }) {
    const key = slug ?? slugify(name ?? "");
    if (!key) return { ok: false as const, error: "Pass a slug to edit, or a name to create." };
    try {
      const project = await upsertProject(key, {
        name,
        summary,
        year,
        liveUrl: live_url,
        repoUrl: repo_url,
        workSlug: work_slug,
        status,
        sortOrder: sort_order,
        capabilities,
        slug: new_slug ? slugify(new_slug) : undefined,
      });
      return {
        ok: true as const,
        slug: project.slug,
        name: project.name,
        status: project.status,
        capabilities: project.capabilities.map((l) => l.capabilitySlug),
        url: `${CAPABILITIES_URL}#${project.slug}`,
      };
    } catch (error) {
      return { ok: false as const, error: error instanceof Error ? error.message : String(error) };
    }
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: output.error };
    return {
      type: "text",
      value: `Saved ${output.name} [${output.status}] (slug: ${output.slug}), proving: ${output.capabilities.join(", ") || "nothing yet"}. ${output.status === "published" ? output.url : "Draft — not on the public page until published."}`,
    };
  },
});

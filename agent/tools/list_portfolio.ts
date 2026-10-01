import { defineTool } from "eve/tools";
import { z } from "zod";
import { CAPABILITIES_URL, getPortfolio } from "../../lib/portfolio";

export default defineTool({
  description:
    "List Berto's portfolio for bertomill.com/capabilities: every capability (slug, name, summary) and every project (drafts and published) with the capabilities it proves and the evidence for each. Call this before save_capability or save_portfolio_project to get the right slugs.",
  inputSchema: z.object({}),
  async execute() {
    const { capabilities, projects } = await getPortfolio();
    return {
      url: CAPABILITIES_URL,
      capabilities: capabilities.map((c) => ({
        slug: c.slug,
        name: c.name,
        summary: c.summary,
        projects: projects.filter((p) => p.capabilities.some((l) => l.capabilityId === c.id)).map((p) => p.slug),
      })),
      projects: projects.map((p) => ({
        slug: p.slug,
        name: p.name,
        status: p.status,
        summary: p.summary,
        year: p.year,
        live_url: p.liveUrl,
        repo_url: p.repoUrl,
        work_slug: p.workSlug,
        capabilities: p.capabilities.map((l) => ({ slug: l.capabilitySlug, evidence: l.evidence })),
      })),
    };
  },
  toModelOutput(output) {
    const caps = output.capabilities.map((c) => `- ${c.name} (slug=${c.slug}) — projects: ${c.projects.join(", ") || "none yet"}`);
    const projects = output.projects.map(
      (p) =>
        `- ${p.name} [${p.status}] slug=${p.slug}\n` +
        p.capabilities.map((l) => `    • ${l.slug}: ${l.evidence || "(no evidence written)"}`).join("\n"),
    );
    return {
      type: "text",
      value: `Capabilities (${output.url}):\n${caps.join("\n") || "none"}\n\nProjects:\n${projects.join("\n") || "none"}`,
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Shipping stats from GitHub: merged pull requests, which are how the Craft form of wealth is measured. Returns the all-time total, a month-by-month breakdown, the busiest repos, and the most recent PRs. Use for questions about how much has been shipped, coding pace, or which project is getting the work.",
  inputSchema: z.object({
    recent_limit: z.number().int().min(0).max(50).default(10),
  }),
  async execute({ recent_limit }) {
    const sql = getDb();
    const [totals] = await sql`SELECT COUNT(*)::int AS total FROM github_prs`;
    const byMonth = await sql`
      SELECT to_char(merged_at, 'YYYY-MM') AS month, COUNT(*)::int AS count
      FROM github_prs
      GROUP BY 1 ORDER BY 1 DESC LIMIT 12
    `;
    const byRepo = await sql`
      SELECT repo, COUNT(*)::int AS count
      FROM github_prs
      GROUP BY 1 ORDER BY 2 DESC LIMIT 8
    `;
    const recent = recent_limit
      ? await sql`
          SELECT repo, number, title, url, merged_at
          FROM github_prs
          ORDER BY merged_at DESC LIMIT ${recent_limit}
        `
      : [];
    return { total: totals?.total ?? 0, byMonth, byRepo, recent };
  },
  toModelOutput(output) {
    if (output.total === 0) return { type: "text", value: "No merged pull requests on record yet." };
    const lines = [
      `${output.total} merged pull requests all time.`,
      "",
      "By month (most recent first):",
      ...output.byMonth.map((m) => `  ${m.month}: ${m.count}`),
      "",
      "Busiest repos:",
      ...output.byRepo.map((r) => `  ${r.repo}: ${r.count}`),
    ];
    if (output.recent.length) {
      lines.push("", "Most recent:");
      for (const r of output.recent) {
        lines.push(`  ${String(r.merged_at).slice(0, 10)} ${r.repo}#${r.number} — ${r.title}`);
      }
    }
    return { type: "text", value: lines.join("\n") };
  },
});

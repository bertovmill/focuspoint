import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Save a dream analysis report — a consolidated synthesis of the user's recent thoughts and todos. Call this once you've identified recurring patterns and insights, so they're stored for the Dreams tab and for get_dream_summary to recall later.",
  inputSchema: z.object({
    summary: z.string().min(1).describe("A short narrative summary of what this dream cycle found"),
    patterns: z
      .array(
        z.object({
          theme: z.string().min(1),
          evidence: z.string().min(1),
          frequency: z.number().int().min(1),
        }),
      )
      .describe("Recurring themes found, each with supporting evidence and how many times it showed up"),
    insights: z.array(z.string().min(1)).min(1).describe("3-5 concise, specific insights written as if for a trusted guide"),
    thoughts_analyzed: z.number().int().min(0).describe("How many notes/thoughts were reviewed"),
    todos_analyzed: z.number().int().min(0).describe("How many todos were reviewed"),
  }),
  async execute({ summary, patterns, insights, thoughts_analyzed, todos_analyzed }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO dreams (summary, patterns, insights, thoughts_analyzed, todos_analyzed)
      VALUES (${summary}, ${JSON.stringify(patterns)}, ${insights}, ${thoughts_analyzed}, ${todos_analyzed})
      RETURNING id, dream_date
    `;
    return {
      id: Number(row.id),
      dream_date: String(row.dream_date),
      patterns_found: patterns.length,
      insights_written: insights.length,
    };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Dream saved (${output.dream_date}) — ${output.patterns_found} patterns, ${output.insights_written} insights.`,
    };
  },
});

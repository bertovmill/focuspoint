import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Retrieve the latest dream summary — consolidated insights about the user's patterns, recurring themes, and important signals extracted from their recent thoughts and todos. Call this at the start of a session to load what you've learned about this person, or when you want to surface a pattern proactively.",
  inputSchema: z.object({}),
  async execute() {
    const sql = getDb();
    const [row] = await sql`
      SELECT summary, patterns, insights, thoughts_analyzed, todos_analyzed, dream_date
      FROM dreams
      ORDER BY created_at DESC
      LIMIT 1
    `;

    if (!row) {
      return {
        available: false,
        message: "No dream report yet. The first one will be generated tonight.",
      };
    }

    return {
      available: true,
      dream_date: String(row.dream_date),
      summary: String(row.summary),
      patterns: row.patterns as Array<{ theme: string; evidence: string; frequency: number }>,
      insights: row.insights as string[],
      data_points: {
        thoughts: Number(row.thoughts_analyzed),
        todos: Number(row.todos_analyzed),
      },
    };
  },
  toModelOutput(output) {
    if (!output.available) {
      return { type: "text", value: output.message ?? "No dream report yet." };
    }
    const patterns = (output.patterns as Array<{ theme: string; evidence: string; frequency: number }>)
      .map((p) => `  • ${p.theme} (${p.frequency}x): ${p.evidence}`)
      .join("\n");
    const insights = (output.insights as string[]).map((i) => `  • ${i}`).join("\n");
    const dp = output.data_points as { thoughts: number; todos: number };
    return {
      type: "text",
      value: `Dream summary from ${output.dream_date ?? "unknown"} (${dp.thoughts} thoughts, ${dp.todos} todos analyzed):\n\n${output.summary ?? ""}\n\nPatterns:\n${patterns}\n\nInsights:\n${insights}`,
    };
  },
});

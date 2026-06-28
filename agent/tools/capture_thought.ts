import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Save a thought, idea, observation, or reflection the user shares. Call this whenever the user expresses something personal, mentions a goal, shares a feeling, or says something they want to remember.",
  inputSchema: z.object({
    content: z.string().describe("The thought to capture, in the user's own words or a close paraphrase"),
    tags: z.array(z.string()).optional().describe("Short topic tags, e.g. ['health', 'work', 'goals']"),
  }),
  async execute({ content, tags }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thoughts (content, tags)
      VALUES (${content}, ${tags ?? []})
      RETURNING id, created_at
    `;
    return { id: row.id, captured: true, timestamp: row.created_at };
  },
  toModelOutput(output) {
    return { type: "text", value: `Thought captured (id: ${output.id}).` };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Save a thought, idea, observation, or reflection the user shares. Always call list_folders first to pick the right folder_id. If no suitable folder exists, call create_folder first. Call this whenever the user expresses something personal, mentions a goal, shares a feeling, or says something they want to remember.",
  inputSchema: z.object({
    content: z.string().describe("The thought to capture, in the user's own words or a close paraphrase"),
    tags: z.array(z.string()).optional().describe("Short topic tags, e.g. ['health', 'work', 'goals']"),
    folder_id: z.number().int().optional().describe("ID of the folder to file this note under (get from list_folders or create_folder)"),
  }),
  async execute({ content, tags, folder_id }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thoughts (content, tags, folder_id)
      VALUES (${content}, ${tags ?? []}, ${folder_id ?? null})
      RETURNING id, folder_id, created_at
    `;
    return { id: row.id, folder_id: row.folder_id, captured: true, timestamp: row.created_at };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Thought captured (id: ${output.id}${output.folder_id ? `, folder: ${output.folder_id}` : ""}).`,
    };
  },
});

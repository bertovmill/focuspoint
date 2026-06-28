import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Create a folder (or subfolder) to organize notes. Use this before capturing a note when the right folder doesn't exist yet. A folder with no parent_id is a top-level folder; pass a parent_id to create a subfolder.",
  inputSchema: z.object({
    name: z.string().describe("Folder name, e.g. 'Work' or 'Health'"),
    parent_id: z.number().int().optional().describe("ID of the parent folder to nest this under"),
  }),
  async execute({ name, parent_id }) {
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO folders (name, parent_id)
      VALUES (${name}, ${parent_id ?? null})
      ON CONFLICT (name, parent_id) DO UPDATE SET name = EXCLUDED.name
      RETURNING id, name, parent_id
    `;
    return { id: Number(row.id), name: String(row.name), parent_id: row.parent_id != null ? Number(row.parent_id) : null };
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `Folder "${output.name}" ready (id: ${output.id}${output.parent_id ? `, parent: ${output.parent_id}` : ""}).`,
    };
  },
});

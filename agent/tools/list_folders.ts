import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "List all folders and subfolders. Call this before capturing a note so you can pick the right folder_id, or before creating a folder to avoid duplicates.",
  inputSchema: z.object({}),
  async execute() {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, parent_id, created_at
      FROM folders
      ORDER BY parent_id NULLS FIRST, name ASC
    `;
    return { folders: rows, count: rows.length };
  },
});

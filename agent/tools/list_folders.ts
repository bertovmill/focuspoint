import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db";

export default defineTool({
  description:
    "List all folders and subfolders. The Daily snapshot already lists them, so this is only for when that list is missing or may be stale (e.g. to check for a duplicate right before create_folder).",
  inputSchema: z.object({}),
  async execute() {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, parent_id
      FROM folders
      ORDER BY parent_id NULLS FIRST, name ASC
    `;
    const folders = rows.map((r) => ({ id: Number(r.id), name: String(r.name), parent_id: r.parent_id != null ? Number(r.parent_id) : null }));
    return { folders, count: folders.length };
  },
});

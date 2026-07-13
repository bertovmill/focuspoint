import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Update a vision item: reword a statement, edit a goal's title/description/horizon, mark a goal achieved (or not), or change an image caption. Get the id from list_vision.",
  inputSchema: z.object({
    id: z.number().describe("The vision item id"),
    title: z.string().optional(),
    content: z.string().optional(),
    horizon: z.enum(["1yr", "5yr", "10yr", "someday"]).optional(),
    achieved: z.boolean().optional().describe("Mark a goal achieved (true) or back to active (false)"),
  }),
  async execute({ id, title, content, horizon, achieved }) {
    const sql = getDb();
    const [row] = await sql`
      UPDATE vision_items
      SET
        title = COALESCE(${title ?? null}, title),
        content = COALESCE(${content ?? null}, content),
        horizon = COALESCE(${horizon ?? null}, horizon),
        achieved = COALESCE(${achieved ?? null}, achieved),
        achieved_at = CASE
          WHEN ${achieved ?? null}::boolean IS NULL THEN achieved_at
          WHEN ${achieved ?? null}::boolean THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, kind, title, content, horizon, achieved
    `;
    if (!row) throw new Error(`No vision item with id ${id}`);
    return row;
  },
  toModelOutput(output) {
    const label = output.title ?? output.content ?? "";
    return { type: "text", value: `Vision ${output.kind} #${output.id} updated: "${label}"${output.achieved ? " — achieved 🎉" : ""}` };
  },
});

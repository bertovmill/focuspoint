import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description: "Delete a vision item (statement, goal, or image) by id. Confirm with the user first unless they explicitly asked to remove it.",
  inputSchema: z.object({
    id: z.number().describe("The vision item id (from list_vision)"),
  }),
  async execute({ id }) {
    const sql = getDb();
    const [row] = await sql`
      DELETE FROM vision_items WHERE id = ${id}
      RETURNING id, kind, title, content
    `;
    if (!row) throw new Error(`No vision item with id ${id}`);
    return row;
  },
  toModelOutput(output) {
    const label = output.title ?? output.content ?? "";
    return { type: "text", value: `Vision ${output.kind} #${output.id} deleted ("${label}")` };
  },
});

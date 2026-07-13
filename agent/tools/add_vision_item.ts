import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Add an item to the user's Vision page: a vision statement (content required, title = optional life area like 'Career'), a long-term goal (title required, optional horizon), or a vision-board image (image_url required, title = caption).",
  inputSchema: z.object({
    kind: z.enum(["statement", "goal", "image"]),
    title: z.string().optional().describe("Statement area, goal title, or image caption"),
    content: z.string().optional().describe("Statement body or goal description"),
    image_url: z.string().optional().describe("Public image URL (kind 'image' only)"),
    horizon: z
      .enum(["1yr", "5yr", "10yr", "someday"])
      .optional()
      .describe("Goal horizon: 1yr = this year, 5yr, 10yr, or someday"),
  }),
  async execute({ kind, title, content, image_url, horizon }) {
    if (kind === "statement" && !content?.trim()) throw new Error("A statement needs content.");
    if (kind === "goal" && !title?.trim()) throw new Error("A goal needs a title.");
    if (kind === "image" && !image_url?.trim()) throw new Error("An image needs an image_url.");
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO vision_items (kind, title, content, image_url, horizon)
      VALUES (${kind}, ${title?.trim() || null}, ${content?.trim() || null}, ${image_url?.trim() || null}, ${horizon ?? null})
      RETURNING id, kind, title, content, horizon
    `;
    return row;
  },
  toModelOutput(output) {
    const label = output.title ?? output.content ?? "";
    return { type: "text", value: `Vision ${output.kind} added: "${label}"${output.horizon ? ` (${output.horizon})` : ""} (id: ${output.id})` };
  },
});

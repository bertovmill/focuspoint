import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Add an item to the user's Vision page: a vision statement (content required, title = optional life area like 'Career'), a long-term goal (title required, optional horizon), a vision-board image (image_url required, title = caption), a method (title = the form of wealth it belongs to, content = the daily practices), a milestone (title = the year e.g. '2027', content = what that year looks like — part of the 2026-2030 timeline), or a routine (title = the routine's name e.g. 'Weekly Workout Routine', content = the schedule, one line per day/period).",
  inputSchema: z.object({
    kind: z.enum(["statement", "goal", "image", "method", "milestone", "routine"]),
    title: z.string().optional().describe("Statement area, goal title, image caption, method's form of wealth, milestone year, or routine name"),
    content: z.string().optional().describe("Statement body, goal description, method practices, milestone description, or routine schedule"),
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
    if (kind === "method" && (!title?.trim() || !content?.trim()))
      throw new Error("A method needs a title (the form of wealth) and content (the practices).");
    if (kind === "milestone" && (!title?.trim() || !content?.trim()))
      throw new Error("A milestone needs a title (the year) and content (what that year looks like).");
    if (kind === "routine" && (!title?.trim() || !content?.trim()))
      throw new Error("A routine needs a title (its name) and content (the schedule).");
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

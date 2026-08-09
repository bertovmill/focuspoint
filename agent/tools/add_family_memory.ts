import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Log a Family memory: a photo with a title and description. Use the URL returned by the /api/upload endpoint when the user has uploaded a photo to the app.",
  inputSchema: z.object({
    image_url: z.string().describe("Public image URL of the photo"),
    title: z.string().optional().describe("Short title for the memory"),
    description: z.string().optional().describe("What happened / who was there"),
  }),
  async execute({ image_url, title, description }) {
    if (!image_url?.trim()) throw new Error("A memory needs an image_url.");
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO memories (title, description, image_url)
      VALUES (${title?.trim() || null}, ${description?.trim() || null}, ${image_url.trim()})
      RETURNING id, title, description, image_url, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Family memory added: "${output.title ?? "untitled"}" (id: ${output.id})` };
  },
});

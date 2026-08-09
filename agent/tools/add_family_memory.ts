import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Log a Family memory: a title and/or description, with an optional photo and an optional date it happened (defaults to today). Use the URL returned by the /api/upload endpoint when the user has uploaded a photo to the app.",
  inputSchema: z.object({
    image_url: z.string().optional().describe("Public image URL of the photo, if there is one"),
    title: z.string().optional().describe("Short title for the memory"),
    description: z.string().optional().describe("What happened / who was there"),
    memory_date: z.string().optional().describe("Date the memory happened, YYYY-MM-DD. Defaults to today."),
  }),
  async execute({ image_url, title, description, memory_date }) {
    if (!image_url?.trim() && !title?.trim() && !description?.trim()) {
      throw new Error("A memory needs a photo, title, or description.");
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO memories (title, description, image_url, memory_date)
      VALUES (
        ${title?.trim() || null},
        ${description?.trim() || null},
        ${image_url?.trim() || null},
        ${memory_date?.trim() || new Date().toISOString().slice(0, 10)}
      )
      RETURNING id, title, description, image_url, memory_date, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Family memory added: "${output.title ?? "untitled"}" (id: ${output.id})` };
  },
});

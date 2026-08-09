import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";

export default defineTool({
  description:
    "Log a Service thank-you: a screenshot or photo of a DM, email, or written card someone sent thanking the user, with an optional short title/note and an optional date it arrived (defaults to today). Use the URL returned by the /api/upload endpoint when the user has uploaded a photo to the app. Feeds the Service wealth-form chart and its goal.",
  inputSchema: z.object({
    image_url: z.string().optional().describe("Public image URL of the screenshot/photo, if there is one"),
    title: z.string().optional().describe("Short title, e.g. who it's from"),
    note: z.string().optional().describe("What they said / context"),
    thanked_date: z.string().optional().describe("Date it arrived, YYYY-MM-DD. Defaults to today."),
  }),
  async execute({ image_url, title, note, thanked_date }) {
    if (!image_url?.trim() && !title?.trim() && !note?.trim()) {
      throw new Error("A thank-you needs a photo, title, or note.");
    }
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO thank_yous (title, note, image_url, thanked_date)
      VALUES (
        ${title?.trim() || null},
        ${note?.trim() || null},
        ${image_url?.trim() || null},
        ${thanked_date?.trim() || new Date().toISOString().slice(0, 10)}
      )
      RETURNING id, title, note, image_url, thanked_date, created_at
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Thank-you logged${output.title ? `: "${output.title}"` : ""} (id: ${output.id})` };
  },
});

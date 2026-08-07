import { defineTool } from "eve/tools";
import { z } from "zod";
import { generateImage } from "ai";
import { put } from "@vercel/blob";
import { getDb } from "../../lib/db.js";

// Photorealistic food-photography image model via the AI Gateway.
const IMAGE_MODEL = "google/imagen-4.0-generate-001";

export default defineTool({
  description:
    "Set today's meal recommendation: generates a photorealistic photo of the dish and saves the name, description, cuisine, and photo for the day. Call `list_meal_history` first to review recent feedback before deciding on the meal. Re-calling this on the same day overwrites today's recommendation.",
  inputSchema: z.object({
    name: z.string().min(1).describe("Short dish name, e.g. 'Grilled Branzino with Lemon and Herbs'"),
    description: z
      .string()
      .min(1)
      .describe("1-2 sentence description of the dish — what it is and why it fits today's pick"),
    cuisine: z.string().min(1).describe("Cuisine, e.g. 'Mediterranean' or 'Italian'"),
    image_prompt: z
      .string()
      .min(1)
      .describe(
        "Vivid visual description of the plated dish for photorealistic food photography — describe the food, plating, and setting, not just the name",
      ),
  }),
  async execute({ name, description, cuisine, image_prompt }) {
    const { image } = await generateImage({
      model: IMAGE_MODEL,
      prompt: `Professional food photography, overhead or 45-degree angle shot, natural light, appetizing plating: ${image_prompt}`,
      aspectRatio: "4:3",
    });

    const blob = await put(`meals/${Date.now()}.png`, Buffer.from(image.base64, "base64"), {
      access: "public",
      contentType: image.mediaType ?? "image/png",
    });

    const sql = getDb();
    const [row] = await sql`
      INSERT INTO meal_recommendations (name, description, cuisine, image_url)
      VALUES (${name}, ${description}, ${cuisine}, ${blob.url})
      ON CONFLICT (meal_date) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        cuisine = EXCLUDED.cuisine,
        image_url = EXCLUDED.image_url,
        feedback = NULL,
        feedback_at = NULL
      RETURNING id, meal_date, name, description, cuisine, image_url
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Today's meal set: "${output.name}" (${output.cuisine}).` };
  },
});

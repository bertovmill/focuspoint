import { defineTool } from "eve/tools";
import { z } from "zod";
import { getDb } from "../../lib/db.js";
import { generateMealImage } from "../../lib/nutrition-art.js";

export default defineTool({
  description:
    "Set one of today's three meal recommendations (lunch, snack, or dinner): generates a photorealistic photo of the dish and saves it for that sitting. The app already fills all three in automatically each morning — use this only when Berto asks for a specific dish, or asks you to change one. Call `list_meal_history` first to review recent picks and feedback. Re-calling for the same day and slot overwrites that sitting.",
  inputSchema: z.object({
    slot: z
      .enum(["lunch", "snack", "dinner"])
      .describe("Which sitting this is for. Berto eats one lunch, one snack and one dinner a day."),
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
  async execute({ slot, name, description, cuisine, image_prompt }) {
    const image_url = await generateMealImage(image_prompt, slot);

    const sql = getDb();
    const [row] = await sql`
      INSERT INTO meal_recommendations (slot, name, description, cuisine, image_url)
      VALUES (${slot}, ${name}, ${description}, ${cuisine}, ${image_url})
      ON CONFLICT (meal_date, slot) DO UPDATE SET
        name = EXCLUDED.name,
        description = EXCLUDED.description,
        cuisine = EXCLUDED.cuisine,
        image_url = EXCLUDED.image_url,
        feedback = NULL,
        feedback_at = NULL
      RETURNING id, meal_date, slot, name, description, cuisine, image_url
    `;
    return row;
  },
  toModelOutput(output) {
    return { type: "text", value: `Today's ${output.slot} set: "${output.name}" (${output.cuisine}).` };
  },
});

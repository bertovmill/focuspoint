import { defineTool } from "eve/tools";
import { z } from "zod";
import { generateMealImage } from "../../lib/nutrition-art";
import { setPlannedMeal } from "../../lib/nutrition-plan";

export default defineTool({
  description:
    "Set one sitting (lunch, snack, or dinner) on Berto's meal plan — today by default, or any date for the week grid at /nutrition/plan. Saves the dish with its protein and calorie estimate and a shopping list of ingredients, and generates a photo for today's sittings. The app already fills today's three in automatically each morning — use this when Berto asks for a specific dish, wants one changed, or asks you to plan ahead. Call `list_meal_history` first to review recent picks and feedback. Re-calling for the same date and slot overwrites that cell.",
  inputSchema: z.object({
    slot: z
      .enum(["lunch", "snack", "dinner"])
      .describe("Which sitting this is for. Berto eats one lunch, one snack and one dinner a day."),
    date: z.string().optional().describe("ISO date, e.g. '2026-09-28'. Defaults to today."),
    name: z.string().min(1).describe("Short dish name, e.g. 'Lentil and sweet potato bowl'"),
    description: z
      .string()
      .min(1)
      .describe("1-2 sentence description of the dish — what it is and why it fits"),
    cuisine: z.string().min(1).describe("Cuisine, e.g. 'Mediterranean'"),
    protein_g: z.number().describe("Estimated grams of protein in one serving"),
    kcal: z.number().int().describe("Estimated calories in one serving"),
    ingredients: z.array(z.string()).describe("Shopping-list ingredients, one per entry with a rough amount"),
    image_prompt: z
      .string()
      .optional()
      .describe(
        "Vivid visual description of the plated dish for photorealistic food photography. Only used for today's sittings; skip it for future days.",
      ),
  }),
  async execute({ slot, date, name, description, cuisine, protein_g, kcal, ingredients, image_prompt }) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = date ?? today;
    const image_url = day === today && image_prompt ? await generateMealImage(image_prompt, slot) : null;
    return setPlannedMeal({ date: day, slot, name, description, cuisine, protein_g, kcal, ingredients, image_url });
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `${output.meal_date} ${output.slot} set: "${output.name}" (${output.cuisine ?? "—"}, ${output.protein_g ?? "?"} g protein, ${output.kcal ?? "?"} kcal).`,
    };
  },
});

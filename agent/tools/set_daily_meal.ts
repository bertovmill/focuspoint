import { defineTool } from "eve/tools";
import { z } from "zod";
import { fillFromBank, findRecipeByName, listRecipes, setPlannedMeal } from "../../lib/nutrition-plan";

export default defineTool({
  description:
    "Put a meal from Berto's meal bank on one sitting (lunch, snack, or dinner) of his plan at /meals — today by default, or any date. Every planned meal comes from the bank; never invent a dish. Pass `meal` with the bank entry's name to choose it, or leave it out to rotate in whichever bank meal for that sitting he's had least lately. If the name isn't in the bank the call fails and lists what is — ask Berto to add a new meal to the bank on /meals rather than making one up. Re-calling for the same date and slot overwrites that cell.",
  inputSchema: z.object({
    slot: z
      .enum(["lunch", "snack", "dinner"])
      .describe("Which sitting this is for. Berto eats one lunch, one snack and one dinner a day."),
    date: z.string().optional().describe("ISO date, e.g. '2026-09-28'. Defaults to today."),
    meal: z.string().optional().describe("Name of a meal in the bank, e.g. 'Rigatoni with Beef & Navy Bean Ragù'. Omit to rotate one in."),
  }),
  async execute({ slot, date, meal }) {
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const day = date ?? today;
    if (!meal) {
      const { filled } = await fillFromBank([{ date: day, slot }], { overwrite: true });
      if (!filled[0]) throw new Error(`Nothing in the meal bank for ${slot}.`);
      return filled[0];
    }
    const recipe = await findRecipeByName(meal);
    if (!recipe) {
      const bank = await listRecipes();
      throw new Error(
        `"${meal}" isn't in the meal bank. Bank: ${bank.map((r) => `${r.name}${r.slot ? ` (${r.slot})` : ""}`).join("; ") || "empty"}.`,
      );
    }
    return setPlannedMeal({ date: day, slot, name: "", recipe_id: recipe.id });
  },
  toModelOutput(output) {
    return {
      type: "text",
      value: `${output.meal_date} ${output.slot} set: "${output.name}" (${output.protein_g ?? "?"} g protein, ${output.kcal ?? "?"} kcal).`,
    };
  },
});

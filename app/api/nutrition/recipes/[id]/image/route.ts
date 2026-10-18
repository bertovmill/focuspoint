import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateRecipeImage } from "@/lib/nutrition-art";
import { shapeRecipe } from "@/lib/nutrition-plan";

// One gpt-image-1 call plus the upload — well past the Next.js dev default.
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

// POST   generates (or regenerates) the photo for one bank meal and puts it on
// every planned cell made from that meal, so the grid picks it up too.
export async function POST(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sql = getDb();
    const [cur] = await sql`SELECT * FROM nutrition_recipes WHERE id = ${id}`;
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const recipe = shapeRecipe(cur as Record<string, unknown>);
    const image_url = await generateRecipeImage(recipe);
    const [row] = await sql`
      UPDATE nutrition_recipes SET image_url = ${image_url}, updated_at = NOW() WHERE id = ${id}
      RETURNING id, name, description, slot, protein_g, kcal, ingredients, image_url, created_at
    `;
    await sql`UPDATE meal_recommendations SET image_url = ${image_url} WHERE recipe_id = ${id}`;
    return NextResponse.json(shapeRecipe(row as Record<string, unknown>));
  } catch (err) {
    console.error("[api/nutrition/recipes/image]", err);
    return NextResponse.json({ error: "Couldn't make a picture — try again." }, { status: 500 });
  }
}

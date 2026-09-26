import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MEAL_SLOT_KEYS, normalizeIngredients } from "@/lib/nutrition";
import { shapeRecipe } from "@/lib/nutrition-plan";

type Params = { params: Promise<{ id: string }> };

// PATCH any subset of { name, description, slot, protein_g, kcal, ingredients }
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    const sql = getDb();
    const [cur] = await sql`SELECT * FROM nutrition_recipes WHERE id = ${id}`;
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const name = body.name !== undefined ? String(body.name).trim() : String(cur.name);
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const slot = body.slot !== undefined ? (MEAL_SLOT_KEYS.includes(body.slot) ? body.slot : null) : cur.slot;
    const protein =
      body.protein_g !== undefined ? (body.protein_g === null || body.protein_g === "" ? null : Number(body.protein_g)) : cur.protein_g;
    const kcal = body.kcal !== undefined ? (body.kcal === null || body.kcal === "" ? null : Math.round(Number(body.kcal))) : cur.kcal;
    const ingredients = body.ingredients !== undefined ? normalizeIngredients(body.ingredients) : cur.ingredients;
    const description =
      body.description !== undefined
        ? typeof body.description === "string" && body.description.trim()
          ? body.description.trim()
          : null
        : cur.description;
    const [row] = await sql`
      UPDATE nutrition_recipes SET
        name = ${name}, description = ${description}, slot = ${slot},
        protein_g = ${protein}, kcal = ${kcal}, ingredients = ${ingredients}, updated_at = NOW()
      WHERE id = ${id}
      RETURNING id, name, description, slot, protein_g, kcal, ingredients, image_url, created_at
    `;
    return NextResponse.json(shapeRecipe(row as Record<string, unknown>));
  } catch {
    return NextResponse.json({ error: "Failed to update recipe" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const sql = getDb();
    await sql`DELETE FROM nutrition_recipes WHERE id = ${id}`;
    // Cells picked from it keep their copied values; only the back-reference goes.
    await sql`UPDATE meal_recommendations SET recipe_id = NULL WHERE recipe_id = ${id}`;
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to delete recipe" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { MEAL_SLOT_KEYS, normalizeIngredients } from "@/lib/nutrition";
import { shapeRecipe } from "@/lib/nutrition-plan";

export async function GET() {
  try {
    const sql = getDb();
    const rows = await sql`
      SELECT id, name, description, slot, protein_g, kcal, ingredients, image_url, created_at
      FROM nutrition_recipes
      ORDER BY name ASC
    `;
    return NextResponse.json(rows.map((r) => shapeRecipe(r as Record<string, unknown>)));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

// POST { name, slot?, protein_g?, kcal?, ingredients?, description?, image_url? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
    const slot = MEAL_SLOT_KEYS.includes(body?.slot) ? body.slot : null;
    const protein = body?.protein_g === undefined || body?.protein_g === null || body?.protein_g === "" ? null : Number(body.protein_g);
    const kcal = body?.kcal === undefined || body?.kcal === null || body?.kcal === "" ? null : Math.round(Number(body.kcal));
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO nutrition_recipes (name, description, slot, protein_g, kcal, ingredients, image_url)
      VALUES (
        ${name},
        ${typeof body?.description === "string" && body.description.trim() ? body.description.trim() : null},
        ${slot},
        ${protein !== null && Number.isFinite(protein) ? protein : null},
        ${kcal !== null && Number.isFinite(kcal) ? kcal : null},
        ${normalizeIngredients(body?.ingredients)},
        ${body?.image_url || null}
      )
      RETURNING id, name, description, slot, protein_g, kcal, ingredients, image_url, created_at
    `;
    return NextResponse.json(shapeRecipe(row as Record<string, unknown>));
  } catch {
    return NextResponse.json({ error: "Failed to save recipe" }, { status: 500 });
  }
}

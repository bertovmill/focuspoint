import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { ensureTodaysMeals, suggestMeal } from "@/lib/meal-suggest";
import { MEAL_SLOT_KEYS, type MealSlot } from "@/lib/nutrition";

// Generating a dish plus its photo takes a while — well inside Vercel's 300s
// default, but past the Next.js dev default.
export const maxDuration = 120;

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? new Date().toISOString().slice(0, 10);
    const sql = getDb();
    const rows = await sql`
      SELECT id, meal_date, slot, name, description, cuisine, image_url, feedback
      FROM meal_recommendations
      WHERE meal_date = ${date}
    `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

// POST with no body fills in whatever today is missing; POST { slot } re-rolls
// that one sitting even if it already has a suggestion.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slot = body?.slot as string | undefined;
    if (slot) {
      if (!MEAL_SLOT_KEYS.includes(slot)) {
        return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
      }
      const row = await suggestMeal(slot as MealSlot, body?.date);
      return NextResponse.json(row);
    }
    const result = await ensureTodaysMeals(body?.date);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/nutrition/plan]", err);
    return NextResponse.json({ error: "Couldn't suggest a meal" }, { status: 500 });
  }
}

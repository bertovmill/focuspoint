import { NextResponse } from "next/server";
import { ensureTodaysMeals, suggestMeal } from "@/lib/meal-suggest";
import { MEAL_SLOT_KEYS, type MealSlot } from "@/lib/nutrition";
import { clearPlannedMeal, getPlanRange, setPlannedMeal } from "@/lib/nutrition-plan";

// Generating a dish plus its photo takes a while — well inside Vercel's 300s
// default, but past the Next.js dev default.
export const maxDuration = 120;

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET ?date=            one day (defaults to today) — what the Today cards read
// GET ?from=&to=        a range, inclusive — what the week grid reads
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (from && to) {
      if (!ISO.test(from) || !ISO.test(to)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
      return NextResponse.json(await getPlanRange(from, to));
    }
    const date = searchParams.get("date") ?? localToday();
    if (!ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    return NextResponse.json(await getPlanRange(date, date));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

// POST {}                         fills whatever today is missing (with photos)
// POST { slot, date?, with_image? } asks Cael for that one sitting. Photos default
//                                 on for today and off for any other day.
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slot = body?.slot as string | undefined;
    const date = body?.date as string | undefined;
    if (date && !ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    const opts = typeof body?.with_image === "boolean" ? { withImage: body.with_image } : {};
    if (slot) {
      if (!MEAL_SLOT_KEYS.includes(slot)) {
        return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
      }
      const row = await suggestMeal(slot as MealSlot, date, opts);
      return NextResponse.json(row);
    }
    const result = await ensureTodaysMeals(date, opts);
    return NextResponse.json(result);
  } catch (err) {
    console.error("[api/nutrition/plan]", err);
    return NextResponse.json({ error: "Couldn't suggest a meal", detail: String(err) }, { status: 500 });
  }
}

// PUT { date, slot, recipe_id } | { date, slot, name, protein_g?, kcal?, ingredients?, description? }
// Sets a cell by hand. With recipe_id the library entry's fields are copied in.
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { date, slot } = body ?? {};
    if (!ISO.test(String(date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (!MEAL_SLOT_KEYS.includes(slot)) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
    const row = await setPlannedMeal({
      date,
      slot,
      name: String(body.name ?? ""),
      description: body.description ?? null,
      cuisine: body.cuisine ?? null,
      protein_g: body.protein_g === undefined || body.protein_g === null || body.protein_g === "" ? null : Number(body.protein_g),
      kcal: body.kcal === undefined || body.kcal === null || body.kcal === "" ? null : Math.round(Number(body.kcal)),
      ingredients: body.ingredients,
      recipe_id: body.recipe_id ? Number(body.recipe_id) : null,
      image_url: body.image_url ?? null,
    });
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: String(err instanceof Error ? err.message : err) }, { status: 400 });
  }
}

// DELETE ?date=&slot=   empties a cell
export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? "";
    const slot = searchParams.get("slot") ?? "";
    if (!ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (!MEAL_SLOT_KEYS.includes(slot)) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
    await clearPlannedMeal(date, slot);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't clear that" }, { status: 500 });
  }
}

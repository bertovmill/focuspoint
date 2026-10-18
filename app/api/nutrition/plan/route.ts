import { NextResponse } from "next/server";
import { MEAL_SLOTS, MEAL_SLOT_KEYS } from "@/lib/nutrition";
import { clearPlannedMeal, fillFromBank, getPlanRange, movePlannedMeal, setPlannedMeal } from "@/lib/nutrition-plan";

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

// POST {}                  fills whatever the day (default today) is missing from the meal bank
// POST { slot, date? }      swaps that one sitting for a different bank meal
export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const slot = body?.slot as string | undefined;
    const date = (body?.date as string | undefined) ?? localToday();
    if (!ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (slot) {
      if (!MEAL_SLOT_KEYS.includes(slot)) {
        return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
      }
      const { filled } = await fillFromBank([{ date, slot }], { overwrite: true });
      if (!filled[0]) return NextResponse.json({ error: "Nothing in the meal bank for that sitting" }, { status: 400 });
      return NextResponse.json(filled[0]);
    }
    const result = await fillFromBank(MEAL_SLOTS.map((s) => ({ date, slot: s.key })));
    return NextResponse.json({ date, filled: result.filled.map((r) => r.slot), skipped: result.skipped });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
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

// PATCH { from: { date, slot }, to: { date, slot } }   moves a meal (drag on /meals);
// a meal already at `to` swaps into `from`.
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const ends = [body?.from, body?.to] as { date?: unknown; slot?: unknown }[];
    for (const end of ends) {
      if (!ISO.test(String(end?.date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
      if (!MEAL_SLOT_KEYS.includes(String(end?.slot))) return NextResponse.json({ error: "Unknown slot" }, { status: 400 });
    }
    const [from, to] = ends.map((e) => ({ date: String(e.date), slot: String(e.slot) }));
    if (from.date !== to.date || from.slot !== to.slot) await movePlannedMeal(from, to);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't move that" }, { status: 500 });
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

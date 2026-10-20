import { NextResponse } from "next/server";
import { addPlanToGroceries, buildGroceryList } from "@/lib/nutrition-plan";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// GET ?from&to → the grocery list for that range, built from each meal's ingredients
export async function GET(req: Request) {
  const url = new URL(req.url);
  const from = url.searchParams.get("from");
  const to = url.searchParams.get("to");
  if (!ISO.test(String(from)) || !ISO.test(String(to))) {
    return NextResponse.json({ error: "Bad date range" }, { status: 400 });
  }
  try {
    return NextResponse.json(await buildGroceryList(from!, to!));
  } catch (err) {
    console.error("[api/nutrition/groceries]", err);
    return NextResponse.json({ error: "Couldn't build the grocery list" }, { status: 500 });
  }
}

// POST { from, to } → pushes the planned ingredients in that range onto Groceries
export async function POST(req: Request) {
  try {
    const { from, to } = await req.json();
    if (!ISO.test(String(from)) || !ISO.test(String(to))) {
      return NextResponse.json({ error: "Bad date range" }, { status: 400 });
    }
    return NextResponse.json(await addPlanToGroceries(from, to));
  } catch (err) {
    console.error("[api/nutrition/groceries]", err);
    return NextResponse.json({ error: "Couldn't build the grocery list" }, { status: 500 });
  }
}

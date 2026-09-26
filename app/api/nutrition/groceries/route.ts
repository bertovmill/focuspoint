import { NextResponse } from "next/server";
import { addPlanToGroceries } from "@/lib/nutrition-plan";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

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

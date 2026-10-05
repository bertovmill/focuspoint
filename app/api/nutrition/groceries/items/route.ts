import { NextResponse } from "next/server";
import { addQuickGrocery, getOpenGroceries } from "@/lib/nutrition-plan";

// GET → { listId, items } — what's still open on the Groceries list
export async function GET() {
  try {
    return NextResponse.json(await getOpenGroceries());
  } catch (err) {
    console.error("[api/nutrition/groceries/items]", err);
    return NextResponse.json({ error: "Couldn't load Groceries" }, { status: 500 });
  }
}

// POST { title } → a quick item straight onto the Groceries list
export async function POST(req: Request) {
  try {
    const { title } = await req.json();
    const name = typeof title === "string" ? title.trim().replace(/\s+/g, " ") : "";
    if (!name) return NextResponse.json({ error: "title required" }, { status: 400 });
    return NextResponse.json(await addQuickGrocery(name));
  } catch (err) {
    console.error("[api/nutrition/groceries/items]", err);
    return NextResponse.json({ error: "Couldn't add that item" }, { status: 500 });
  }
}

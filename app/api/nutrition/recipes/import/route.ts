import { NextResponse } from "next/server";
import { ImportError, importRecipe } from "@/lib/recipe-import";

// Fetching the page plus one model call.
export const maxDuration = 90;

// POST { url } → saves the recipe at that link (or in that pasted text) into the recipe box
export async function POST(req: Request) {
  try {
    const { url } = await req.json();
    if (typeof url !== "string" || !url.trim()) {
      return NextResponse.json({ error: "Paste a recipe link first." }, { status: 400 });
    }
    return NextResponse.json(await importRecipe(url));
  } catch (err) {
    console.error("[api/nutrition/recipes/import]", err);
    const message = err instanceof ImportError ? err.message : "Couldn't read that page.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

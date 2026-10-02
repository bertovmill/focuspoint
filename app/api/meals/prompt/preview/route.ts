import { NextResponse } from "next/server";
import { buildMealPrompt } from "@/lib/meal-prompt";
import { MealIdea, TEXT_MODEL } from "@/lib/meal-suggest";
import { MEAL_SLOT_KEYS, type MealSlot } from "@/lib/nutrition";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// The fields the model must fill in. Fixed in code (lib/meal-suggest.ts) because
// the grid, grocery list and protein totals read them, but shown so the preview
// is the whole request.
const OUTPUT_FIELDS = Object.entries(MealIdea.shape).map(([name, field]) => ({
  name,
  description: field.description ?? "",
}));

// POST { date, slot, template?, guidance? } → the exact prompt that cell would
// be sent. A draft template/guidance previews unsaved edits.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const date = String(body?.date ?? "");
  const slot = String(body?.slot ?? "");
  if (!ISO.test(date) || !MEAL_SLOT_KEYS.includes(slot)) {
    return NextResponse.json({ error: "date (YYYY-MM-DD) and slot are required" }, { status: 400 });
  }
  const draft =
    typeof body?.template === "string" ? { template: body.template as string, guidance: body.guidance ?? {} } : undefined;
  try {
    const prompt = await buildMealPrompt(slot as MealSlot, date, draft);
    return NextResponse.json({ prompt, model: TEXT_MODEL, output_fields: OUTPUT_FIELDS });
  } catch (err) {
    console.error("[api/meals/prompt/preview]", err);
    return NextResponse.json({ error: "Couldn't build the prompt" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import {
  DEFAULT_MEAL_GUIDANCE,
  DEFAULT_MEAL_PROMPT_TEMPLATE,
  MEAL_PROMPT_VARIABLES,
  getMealPromptConfig,
  resetMealPromptConfig,
  setMealPromptConfig,
} from "@/lib/meal-prompt";

// GET    the saved prompt config, plus the defaults and placeholder list for the editor
export async function GET() {
  try {
    return NextResponse.json({
      ...(await getMealPromptConfig()),
      defaults: { template: DEFAULT_MEAL_PROMPT_TEMPLATE, guidance: DEFAULT_MEAL_GUIDANCE },
      variables: MEAL_PROMPT_VARIABLES,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load the meal prompt" }, { status: 500 });
  }
}

// PUT    { template, guidance: { lunch, snack, dinner } }
export async function PUT(req: Request) {
  try {
    const { template, guidance } = await req.json();
    if (typeof template !== "string" || !template.trim()) {
      return NextResponse.json({ error: "template must be a non-empty string" }, { status: 400 });
    }
    return NextResponse.json(await setMealPromptConfig({ template, guidance: guidance ?? {} }));
  } catch {
    return NextResponse.json({ error: "Couldn't save the meal prompt" }, { status: 500 });
  }
}

// DELETE back to the defaults
export async function DELETE() {
  try {
    return NextResponse.json(await resetMealPromptConfig());
  } catch {
    return NextResponse.json({ error: "Couldn't reset the meal prompt" }, { status: 500 });
  }
}

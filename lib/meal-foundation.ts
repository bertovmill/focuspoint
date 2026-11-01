import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// The top of /meals: why he eats the way he does, before any recipe. Vision,
// values and process in one markdown doc he edits in place. Until he saves it,
// it reads the draft below, written from the eating rules in lib/nutrition.ts.
const MEAL_FOUNDATION_KEY = "meals.foundation.markdown";

const DRAFT = `## Vision

Eat food that keeps me light, clear and strong, every day, without having to think hard about it.

## Values

- **Water-rich first.** Most of every plate is fresh vegetables, greens and fruit.
- **Simple plates.** Protein + vegetables, or starch + vegetables. Never protein with starch.
- **Greens over heavy.** Go light on meat, dairy, sugar, coffee and alcohol.
- **Only meals I love.** If I wouldn't cook it again, it's out.

## Process

1. Save meals I like here: paste a recipe link or the recipe itself.
2. Thumbs up or down after I eat one, so Cael learns my taste.
3. Cael recommends from these meals, inside the rules and my taste.
4. Shop from the grocery list in my meal notes.`;

export function getMealFoundation(): Promise<SettingsDoc> {
  return getSettingsDoc(MEAL_FOUNDATION_KEY, DRAFT);
}

export function setMealFoundation(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(MEAL_FOUNDATION_KEY, content);
}

import { getSettingsDoc, setSettingsDoc, type SettingsDoc } from "@/lib/settings-doc";

// The Notes page under the week on /meals: a free-form markdown doc for what
// isn't tied to one week — his typical grocery list, pantry staples, go-to
// meals. Starts blank. Cael reads and rewrites it through the meals_doc tool.
const MEAL_NOTES_KEY = "meals.notes.markdown";

export function getMealNotes(): Promise<SettingsDoc> {
  return getSettingsDoc(MEAL_NOTES_KEY);
}

export function setMealNotes(content: string): Promise<SettingsDoc> {
  return setSettingsDoc(MEAL_NOTES_KEY, content);
}

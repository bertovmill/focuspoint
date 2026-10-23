import { generateImage } from "ai";
import { uploadWebp as upload } from "./image-upload";

import { RULE_IMAGE_PROMPTS } from "./nutrition";

// One model and one photographic language for every picture in the Nutrition
// section, so it reads as one set rather than three.
//
// gpt-image-1 was the first model here, until the AI Gateway dropped it
// (model_not_found, seen 2026-10-23). FLUX.3 klein is photoreal and about
// $0.009 a picture. The earlier `google/imagen-4.0-generate-001` errored on
// every call too — check a real response before switching models again.
// BFL takes `aspectRatio`, not OpenAI's `size`.
export const FOOD_IMAGE_MODEL = "bfl/flux-3-image-klein";

const PHOTO_STYLE =
  "Professional food photography, natural window light, shallow depth of field, " +
  "on a simple neutral stone or wood surface, no text, no packaging, no people, no hands";

/**
 * A single ingredient, shot like a hero product photo. `why` is Berto's own
 * reason for keeping the food around — it steers the mood (an afternoon
 * pick-me-up looks different from an immune-system staple) without ever being
 * rendered as words in the image.
 */
export async function generateStapleImage(name: string, why?: string | null) {
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt:
      `${PHOTO_STYLE}. A close-up hero shot of ${name} as a raw whole-food ingredient, ` +
      `beautifully arranged, appetising and fresh.${why ? ` Mood: ${why}` : ""}`,
    aspectRatio: "1:1",
  });
  return upload(`nutrition/staples/${slug(name)}`, image, 512);
}

/**
 * Art for one protocol rule, saved under a stable key so it's generated once and
 * then just read. Overwrites in place on a re-run.
 */
export async function generateRuleImage(key: string) {
  const prompt = RULE_IMAGE_PROMPTS[key];
  if (!prompt) throw new Error(`No image prompt for rule: ${key}`);
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt: `${PHOTO_STYLE}. ${prompt}`,
    aspectRatio: "1:1",
  });
  return upload(`nutrition/rules/${key}`, image, 512);
}

/**
 * A photo of one meal in the bank, so he can recognise it on the grid at a
 * glance. Generated on demand from /meals (the button on the meal); the key
 * carries a timestamp so a regenerate isn't served from a cached URL.
 */
export async function generateRecipeImage(recipe: { id: number; name: string; description?: string | null; ingredients?: string[] }) {
  const made = recipe.ingredients?.length ? ` Made with ${recipe.ingredients.slice(0, 10).join(", ")}.` : "";
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt:
      `${PHOTO_STYLE}. Overhead or 45-degree shot of one plated serving of ${recipe.name}, home-cooked and simple.` +
      `${recipe.description ? ` ${recipe.description}` : ""}${made}`,
    aspectRatio: "1:1",
  });
  return upload(`nutrition/recipes/${recipe.id}-${Date.now()}`, image, 512);
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

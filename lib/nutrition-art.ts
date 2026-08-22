import { generateImage } from "ai";
import { put } from "@vercel/blob";

import { RULE_IMAGE_PROMPTS } from "./nutrition";

// Same model and photographic language as the daily meal photos
// (agent/tools/set_daily_meal.ts), so the whole Nutrition section reads as one
// set of pictures rather than three different styles.
export const FOOD_IMAGE_MODEL = "google/imagen-4.0-generate-001";

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
  const blob = await put(`nutrition/staples/${slug(name)}-${Date.now()}.png`, Buffer.from(image.base64, "base64"), {
    access: "public",
    contentType: image.mediaType ?? "image/png",
  });
  return blob.url;
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
  const blob = await put(`nutrition/rules/${key}.png`, Buffer.from(image.base64, "base64"), {
    access: "public",
    contentType: image.mediaType ?? "image/png",
    allowOverwrite: true,
  });
  return blob.url;
}

/** A plated dish for one of the day's three recommendations. */
export async function generateMealImage(imagePrompt: string, slot: string) {
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt: `${PHOTO_STYLE}. Overhead or 45-degree shot of a plated ${slot}: ${imagePrompt}`,
    aspectRatio: "4:3",
  });
  const blob = await put(`nutrition/meals/${slot}-${Date.now()}.png`, Buffer.from(image.base64, "base64"), {
    access: "public",
    contentType: image.mediaType ?? "image/png",
  });
  return blob.url;
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

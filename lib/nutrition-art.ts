import { generateImage } from "ai";
import { put } from "@vercel/blob";

import { RULE_IMAGE_PROMPTS } from "./nutrition";

// One model and one photographic language for every picture in the Nutrition
// section, so it reads as one set rather than three.
//
// gpt-image-1 through the AI Gateway is the path known to work on this project
// (scripts/generate-site-art.mjs has been using it since 2026-08-16). The
// earlier `google/imagen-4.0-generate-001` in set_daily_meal errored on every
// call, which is why meal_recommendations sat empty for weeks — don't go back to
// it without checking a real response first. It takes `size`, not `aspectRatio`.
export const FOOD_IMAGE_MODEL = "openai/gpt-image-1";

// These render at 44px on the page and 24px in the Tasks strip, so medium quality
// is already more than anyone sees.
const OPENAI_OPTIONS = { openai: { quality: "medium", output_format: "webp" } } as const;

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
    size: "1024x1024",
    providerOptions: OPENAI_OPTIONS,
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
    size: "1024x1024",
    providerOptions: OPENAI_OPTIONS,
  });
  return upload(`nutrition/rules/${key}`, image, 512);
}

/** A plated dish for one of the day's three recommendations. */
export async function generateMealImage(imagePrompt: string, slot: string) {
  const { image } = await generateImage({
    model: FOOD_IMAGE_MODEL,
    prompt: `${PHOTO_STYLE}. Overhead or 45-degree shot of a plated ${slot}: ${imagePrompt}`,
    size: "1536x1024",
    providerOptions: OPENAI_OPTIONS,
  });
  return upload(`nutrition/meals/${slot}-${Date.now()}`, image, 1024);
}

/**
 * One blob write for all three generators, and the only place image bytes are
 * sized. The model returns a 1024px PNG of about 1.5 MB whatever we ask for,
 * which is far more than a 44px thumbnail or a card needs — and big enough that
 * Next's image optimizer times out fetching a page's worth of them. So they're
 * re-encoded to webp on the way in. Overwrites, so re-running is free.
 */
async function upload(key: string, image: { base64: string; mediaType?: string }, width: number) {
  // Loaded on demand rather than at module init: this module is pulled into
  // the eve agent bundle via set_daily_meal, and a static import of a native
  // package there is a boot-time crash if the platform binary is missing.
  const { default: sharp } = await import("sharp");
  const webp = await sharp(Buffer.from(image.base64, "base64"))
    .resize(width, undefined, { withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const blob = await put(`${key}.webp`, webp, {
    access: "public",
    contentType: "image/webp",
    allowOverwrite: true,
  });
  return blob.url;
}

function slug(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

import { generateImage } from "ai";
import { uploadWebp } from "./image-upload";

// Same model as the nutrition art and the site art (see lib/nutrition-art.ts for
// why not Imagen). It takes `size`, not `aspectRatio`.
const POST_IMAGE_MODEL = "openai/gpt-image-1";

const NO_TEXT = "No text, no letters, no words, no logos, no watermarks.";

/**
 * One image for an article: a wide cover for the top of the page and link
 * previews, or an inline picture for the body. `prompt` is what Cael wants the
 * picture to show; the style stays whatever the prompt asks for, so a post can
 * be photographic or illustrated.
 */
export async function generatePostImage({
  prompt,
  kind,
  slug,
}: {
  prompt: string;
  kind: "cover" | "inline";
  slug: string;
}): Promise<string> {
  const { image } = await generateImage({
    model: POST_IMAGE_MODEL,
    prompt: `${prompt}. ${NO_TEXT}`,
    size: "1536x1024",
    providerOptions: { openai: { quality: kind === "cover" ? "high" : "medium", output_format: "webp" } },
  });
  return uploadWebp(`writing/${slug}/${kind}-${Date.now()}`, image, 1600);
}

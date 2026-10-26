import { defineTool } from "eve/tools";
import { z } from "zod";
import { fetchTweetImage, postTweet, uploadTweetImage } from "../../../../lib/x-api";
import { estimateTweetCost, formatUsd, TWEET_MAX_IMAGES } from "../../../../lib/x-shared";

export default defineTool({
  description:
    "Post a tweet to X (Twitter) on behalf of the user. Use this when the user asks to tweet, post to X, or share something publicly on Twitter/X. Always confirm the exact tweet text — and any images — with the user before posting. To attach images (up to 4, JPG/PNG/WEBP, 5 MB each), pass their public URLs in image_urls: a photo he uploaded (from its '[Image uploaded — public URL: ...]' marker) or one made with generate_post_image. With images, the text may be empty. Each post costs X API credit: about $0.015, or $0.20 if the text contains a link — mention that when asking to confirm a tweet with a link.",
  inputSchema: z.object({
    text: z
      .string()
      .max(280)
      .describe("The tweet text to post. Must be 280 characters or fewer. May be empty only when image_urls is set."),
    image_urls: z
      .array(z.string().url())
      .max(TWEET_MAX_IMAGES)
      .optional()
      .describe("Public URLs of up to 4 images to attach, in the order they should appear."),
  }),
  async execute({ text, image_urls = [] }) {
    text = text.trim();
    if (!text && image_urls.length === 0) {
      return { success: false as const, error: "The tweet is empty: give it text or at least one image." };
    }
    try {
      const images = await Promise.all(image_urls.map((url) => fetchTweetImage(url)));
      const mediaIds = await Promise.all(images.map((img) => uploadTweetImage(img)));
      const result = await postTweet(text, { mediaIds });
      return {
        success: true as const,
        tweet_id: result.id,
        text,
        images: mediaIds.length,
        url: result.url,
        cost: formatUsd(estimateTweetCost(text)),
      };
    } catch (err) {
      return { success: false as const, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },
  toModelOutput(output) {
    if (!output.success) {
      return { type: "text", value: `Failed to post tweet: ${output.error}` };
    }
    const images = output.images ? ` with ${output.images} image${output.images === 1 ? "" : "s"}` : "";
    return {
      type: "text",
      value: `Tweet posted${images}! View it at ${output.url} (about ${output.cost} in X API credit)`,
    };
  },
});

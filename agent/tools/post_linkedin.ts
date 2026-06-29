import { defineTool } from "eve/tools";
import { z } from "zod";
import { postToLinkedIn } from "../../lib/linkedin-api.js";

export default defineTool({
  description:
    "Post text (and optionally an image) to LinkedIn on behalf of the user. Use when the user asks to share something on LinkedIn, post an update, or publish content. Always confirm the exact post text with the user before posting. If an image is included, confirm the image URL too.",
  inputSchema: z.object({
    text: z
      .string()
      .min(1)
      .max(3000)
      .describe("The post text. LinkedIn supports up to 3000 characters."),
    image_url: z
      .string()
      .url()
      .optional()
      .describe(
        "Optional public URL of an image to attach. Use the URL returned by the /api/upload endpoint when the user has uploaded an image to the app.",
      ),
  }),
  async execute({ text, image_url }) {
    try {
      const result = await postToLinkedIn(text, image_url);
      return { success: true, post_id: result.id, url: result.url, text, had_image: !!image_url };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Unknown error",
      };
    }
  },
  toModelOutput(output) {
    if (!output.success) {
      return { type: "text", value: `Failed to post to LinkedIn: ${output.error}` };
    }
    const imageNote = output.had_image ? " with image" : "";
    return {
      type: "text",
      value: `LinkedIn post published${imageNote}! View it at ${output.url}`,
    };
  },
});

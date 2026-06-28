import { defineTool } from "eve/tools";
import { z } from "zod";
import { postTweet } from "../../lib/x-api.js";

export default defineTool({
  description:
    "Post a tweet to X (Twitter) on behalf of the user. Use this when the user asks to tweet, post to X, or share something publicly on Twitter/X. Always confirm the exact tweet text with the user before posting.",
  inputSchema: z.object({
    text: z
      .string()
      .min(1)
      .max(280)
      .describe("The tweet text to post. Must be 280 characters or fewer."),
  }),
  async execute({ text }) {
    try {
      const result = await postTweet(text);
      return { success: true, tweet_id: result.id, text, url: result.url };
    } catch (err) {
      return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
    }
  },
  toModelOutput(output) {
    if (!output.success) {
      return { type: "text", value: `Failed to post tweet: ${output.error}` };
    }
    return {
      type: "text",
      value: `Tweet posted! View it at ${output.url}`,
    };
  },
});

import { defineTool } from "eve/tools";
import { z } from "zod";
import { getPost, postUrl } from "../../../lib/posts";

export default defineTool({
  description:
    "Read one article from bertomill.com/writing in full: title, summary, tags, cover image and the markdown body. Always read a post before editing it, so edits are made against its current text.",
  inputSchema: z.object({
    slug: z.string().describe("The post's slug, from list_posts"),
  }),
  async execute({ slug }) {
    const post = await getPost(slug);
    if (!post) return { found: false as const, slug };
    return { found: true as const, ...post, url: postUrl(post) };
  },
  toModelOutput(output) {
    if (!output.found) return { type: "text", value: `No post with slug "${output.slug}". Call list_posts.` };
    return {
      type: "text",
      value: [
        `Title: ${output.title}`,
        `Slug: ${output.slug}`,
        `Status: ${output.status}${output.publishedAt ? ` (${output.publishedAt})` : ""}`,
        `Link: ${output.url}`,
        `Summary: ${output.summary || "(none)"}`,
        `Tags: ${output.tags.join(", ") || "(none)"}`,
        `Cover: ${output.coverUrl ? `${output.coverUrl} (alt: ${output.coverAlt ?? ""})` : "(none)"}`,
        "",
        "Body (markdown):",
        output.body || "(empty)",
      ].join("\n"),
    };
  },
});

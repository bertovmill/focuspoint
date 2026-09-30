import { defineTool } from "eve/tools";
import { z } from "zod";
import { generatePostImage } from "../../lib/post-art";
import { getPost, updatePost } from "../../lib/posts";

export default defineTool({
  description:
    "Generate an image for an article on bertomill.com/writing and get back its public URL. kind 'cover' makes a wide hero image and, with set_as_cover, attaches it to the post straight away; kind 'inline' makes a picture to place in the body with save_post (as `![alt](url)` on its own line where it belongs). Write a concrete visual prompt: subject, composition, style (photographic, editorial illustration, abstract…) and mood — not the article's title. If Berto has uploaded a photo he wants used, use that URL instead of generating. Takes 20–60 seconds.",
  inputSchema: z.object({
    slug: z.string().describe("The post this image is for"),
    prompt: z.string().min(10).describe("What the image should show and how it should look"),
    kind: z.enum(["cover", "inline"]),
    alt: z.string().describe("Short description of the image, for screen readers"),
    set_as_cover: z.boolean().optional().describe("For kind 'cover': attach it as the post's cover now. Default true."),
  }),
  async execute({ slug, prompt, kind, alt, set_as_cover }) {
    const post = await getPost(slug);
    if (!post) return { ok: false as const, error: `No post with slug "${slug}". Create it with save_post first.` };
    try {
      const url = await generatePostImage({ prompt, kind, slug });
      const attached = kind === "cover" && set_as_cover !== false;
      if (attached) await updatePost(slug, { coverUrl: url, coverAlt: alt });
      return { ok: true as const, url, kind, attached, markdown: `![${alt}](${url})` };
    } catch (err) {
      return { ok: false as const, error: `Image generation failed: ${err instanceof Error ? err.message : String(err)}` };
    }
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: output.error };
    if (output.attached) return { type: "text", value: `Cover generated and attached: ${output.url}` };
    return { type: "text", value: `Image generated: ${output.url}\nMarkdown: ${output.markdown}` };
  },
});

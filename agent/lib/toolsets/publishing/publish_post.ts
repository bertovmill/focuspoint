import { defineTool } from "eve/tools";
import { z } from "zod";
import { draftBroadcastOnFirstPublish } from "../../../../lib/kit-broadcast";
import { getPost, postUrl, setPostStatus } from "../../../../lib/posts";

export default defineTool({
  description:
    "Publish an article on bertomill.com/writing, or take one down (back to draft). Only publish when Berto has explicitly said to publish this post in this conversation — drafting, editing, or 'looks good' is not a go-ahead. The page and the Writing index update within about a minute. A post's first publish also puts an unsent newsletter draft in Kit; Berto reviews and sends it there.",
  inputSchema: z.object({
    slug: z.string().describe("The post's slug, from list_posts"),
    action: z.enum(["publish", "unpublish"]),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe("Dateline to show (YYYY-MM-DD). Defaults to the original publish date, or today for a first publish."),
  }),
  async execute({ slug, action, date }) {
    const before = await getPost(slug);
    const post = await setPostStatus(slug, action === "publish" ? "published" : "draft", date);
    if (!post) return { ok: false as const, slug };
    const newsletterDraft = await draftBroadcastOnFirstPublish(before, post);
    return { ok: true as const, action, title: post.title, url: postUrl(post), publishedAt: post.publishedAt, newsletterDraft };
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: `No post with slug "${output.slug}". Call list_posts.` };
    return {
      type: "text",
      value:
        output.action === "publish"
          ? `Published "${output.title}" (${output.publishedAt}): ${output.url}${output.newsletterDraft ? " — a newsletter draft is waiting in Kit (kit.com → Send → Broadcasts) for Berto to review and send." : ""}`
          : `"${output.title}" is back to a draft. Preview: ${output.url}`,
    };
  },
});

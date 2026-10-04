import { defineTool } from "eve/tools";
import { z } from "zod";
import { listAllPosts, postUrl } from "../../../lib/posts";

export default defineTool({
  description:
    "List Berto's articles on bertomill.com/writing — drafts and published — with slug, status, date and link (a draft's link is its private preview). Call this before editing a post to find its slug. Substack posts are not here; those are written on Substack.",
  inputSchema: z.object({}),
  async execute() {
    const posts = await listAllPosts();
    return {
      posts: posts.map((p) => ({
        slug: p.slug,
        title: p.title,
        status: p.status,
        published_at: p.publishedAt,
        updated_at: p.updatedAt,
        has_cover: Boolean(p.coverUrl),
        url: postUrl(p),
      })),
    };
  },
  toModelOutput(output) {
    if (output.posts.length === 0) return { type: "text", value: "No articles yet." };
    return {
      type: "text",
      value: output.posts
        .map(
          (p) =>
            `- ${p.title} [${p.status}${p.published_at ? `, ${p.published_at}` : ""}${p.has_cover ? "" : ", no cover"}] slug=${p.slug} ${p.url}`,
        )
        .join("\n"),
    };
  },
});

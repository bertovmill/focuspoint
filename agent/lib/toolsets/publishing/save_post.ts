import { defineTool } from "eve/tools";
import { z } from "zod";
import { createPost, getPost, postUrl, slugify, updatePost } from "../../../../lib/posts";

export default defineTool({
  description:
    "Create or edit an article on bertomill.com/writing. With a new title and no existing slug it creates a DRAFT (never published by this tool — use publish_post). With the slug of an existing post it changes only the fields you pass. For the body, either send the full new markdown in `body`, or send `edits` (exact find/replace pairs against the current body — read it with get_post first) for targeted changes to a long piece. Images: set `cover_url` for the cover (an uploaded photo's public URL from a '[Image uploaded — public URL: ...]' marker, or a URL from generate_post_image), and put pictures inside the article as markdown `![alt text](url)` on their own line. Editing a PUBLISHED post changes the live page — show Berto the change and get his OK first. Returns the post's link (a private preview link for drafts) — share it.",
  inputSchema: z.object({
    slug: z
      .string()
      .optional()
      .describe("Slug of the post to edit. Omit to create a new post (the slug is made from the title)."),
    title: z.string().optional().describe("Headline. Required when creating."),
    summary: z.string().optional().describe("One or two sentences shown under the title and on the index."),
    body: z.string().optional().describe("The complete article body in markdown. Replaces the whole body. Don't repeat the title as an H1; use ## for sections."),
    edits: z
      .array(z.object({ find: z.string().min(1), replace: z.string() }))
      .optional()
      .describe("Targeted body edits applied in order. Each `find` must match the current body exactly once."),
    tags: z.array(z.string()).optional(),
    cover_url: z.string().url().nullable().optional().describe("Cover image URL; null removes the cover."),
    cover_alt: z.string().optional().describe("Short description of the cover image, for screen readers."),
    new_slug: z.string().optional().describe("Rename the post's URL. Avoid once published — old links break."),
  }),
  async execute({ slug, title, summary, body, edits, tags, cover_url, cover_alt, new_slug }) {
    if (body !== undefined && edits?.length) {
      return { ok: false as const, error: "Pass either body or edits, not both." };
    }

    if (!slug) {
      if (!title) return { ok: false as const, error: "A title is needed to create a post." };
      if (edits?.length) return { ok: false as const, error: "A new post has no body to edit yet; pass body." };
      const base = slugify(new_slug ?? title) || `post-${Date.now()}`;
      let candidate = base;
      for (let n = 2; await getPost(candidate); n++) candidate = `${base}-${n}`;
      const post = await createPost(candidate, {
        title,
        summary,
        body: body ?? "",
        tags,
        coverUrl: cover_url ?? null,
        coverAlt: cover_alt ?? null,
      });
      return { ok: true as const, created: true, slug: post.slug, status: post.status, url: postUrl(post) };
    }

    const current = await getPost(slug);
    if (!current) return { ok: false as const, error: `No post with slug "${slug}". Call list_posts.` };

    let nextBody = body;
    if (edits?.length) {
      nextBody = current.body;
      for (const { find, replace } of edits) {
        const count = nextBody.split(find).length - 1;
        if (count !== 1) {
          return {
            ok: false as const,
            error: `Edit not applied: "${find.slice(0, 60)}" matches ${count} times in the body (needs exactly 1). Nothing was saved — re-read with get_post.`,
          };
        }
        nextBody = nextBody.replace(find, () => replace);
      }
    }

    const renamed = new_slug ? slugify(new_slug) : undefined;
    if (renamed && renamed !== slug && (await getPost(renamed))) {
      return { ok: false as const, error: `The slug "${renamed}" is already taken.` };
    }

    const post = await updatePost(slug, {
      slug: renamed,
      title,
      summary,
      body: nextBody,
      tags,
      coverUrl: cover_url,
      coverAlt: cover_alt,
    });
    if (!post) return { ok: false as const, error: `No post with slug "${slug}".` };
    return { ok: true as const, created: false, slug: post.slug, status: post.status, url: postUrl(post) };
  },
  toModelOutput(output) {
    if (!output.ok) return { type: "text", value: output.error };
    const what = output.created ? "Draft created" : output.status === "published" ? "Live post updated" : "Draft saved";
    return { type: "text", value: `${what}: ${output.url} (slug: ${output.slug})` };
  },
});

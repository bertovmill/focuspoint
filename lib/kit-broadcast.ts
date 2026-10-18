import type { Element, Nodes } from "hast";
import { toHtml } from "hast-util-to-html";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import remarkRehype from "remark-rehype";
import { unified } from "unified";
import { kit } from "./kit";
import { postUrl, PUBLIC_SITE_URL, type Post } from "./posts";

/**
 * Newsletter drafts for new posts. A post's first publish on bertomill.com puts
 * an unsent broadcast in Kit; Berto reviews it and presses send there.
 */

/** Depth-first walk over every hast node. */
function visit(node: Nodes, fn: (node: Element | Nodes) => void) {
  fn(node);
  if ("children" in node) for (const child of node.children) visit(child as Nodes, fn);
}

/** Markdown body → email HTML, with relative links and images made absolute. */
function postEmailHtml(post: Post): string {
  const absolute = (src: string) => (src.startsWith("/") ? `${PUBLIC_SITE_URL}${src}` : src);
  const tree = unified().use(remarkParse).use(remarkGfm).use(remarkRehype).runSync(
    unified().use(remarkParse).use(remarkGfm).parse(post.body),
  );
  visit(tree, (node) => {
    if (node.type !== "element") return;
    for (const key of ["href", "src"] as const) {
      const value = node.properties?.[key];
      if (typeof value === "string") node.properties[key] = absolute(value);
    }
  });
  const body = toHtml(tree);
  const url = postUrl(post);
  const cover = post.coverUrl
    ? `<p><img src="${absolute(post.coverUrl)}" alt="${escapeAttr(post.coverAlt ?? "")}" style="max-width:100%;height:auto"></p>`
    : "";
  return `${cover}${body}<hr><p><a href="${url}">Read this on bertomill.com</a></p>`;
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Called after a post's status changes. On a post's *first* publish, puts an
 * unsent broadcast in Kit with the article in it, addressed to everyone.
 * Berto reviews it and presses send in Kit; nothing here can send.
 *
 * "First" is read from `before.publishedAt`: it is only ever null for a post
 * that has never been published (unpublishing keeps the dateline), so taking a
 * post down and putting it back up doesn't leave a second draft.
 *
 * Never throws: a missing Kit draft must not turn a successful publish into an
 * error. Returns whether a draft was made, for callers that want to say so.
 */
export async function draftBroadcastOnFirstPublish(before: Post | null, after: Post | null): Promise<boolean> {
  if (!after || after.status !== "published" || !before || before.publishedAt !== null) return false;
  if (!process.env.KIT_API_KEY) return false;
  try {
    const res = await kit("/broadcasts", {
      method: "POST",
      body: JSON.stringify({
        subject: after.title,
        preview_text: after.summary,
        description: `bertomill.com/writing/${after.slug}`,
        content: postEmailHtml(after),
        // Not public: the article's home is the site, not a Kit web archive.
        public: false,
        published_at: new Date().toISOString(),
        send_at: null,
        // No subscriber_filter: the draft goes to the whole list; narrow it in Kit before sending.
        thumbnail_url: after.coverUrl ? (after.coverUrl.startsWith("/") ? `${PUBLIC_SITE_URL}${after.coverUrl}` : after.coverUrl) : null,
        thumbnail_alt: after.coverAlt,
      }),
    });
    if (!res.ok) {
      console.error("[kit] broadcast draft failed:", res.status, await res.text().catch(() => ""));
      return false;
    }
    return true;
  } catch (err) {
    console.error("[kit] broadcast draft threw:", err);
    return false;
  }
}

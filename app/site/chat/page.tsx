import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { ASK_AI_HASH, SITE_PREFIX, isPublicHost } from "@/lib/public-site";

/**
 * /chat used to be a page. The chat now lives in the Ask AI panel on every page,
 * so old links (show notes, posts, the sitemap Google cached) land on the home
 * page with the panel open rather than on a 404.
 */
export default async function ChatPage() {
  const host = (await headers()).get("host");
  const base = isPublicHost(host) ? "" : SITE_PREFIX;
  redirect(`${base}/${ASK_AI_HASH}`);
}

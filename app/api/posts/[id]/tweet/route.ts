import { NextResponse } from "next/server";
import { getPostById, markPostTweeted, postUrl } from "@/lib/posts";
import { postTweet } from "@/lib/x-api";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST { text } — tweet a published post from the editor and remember the tweet.
 * Drafts are refused: their link carries the preview token.
 */
export async function POST(req: Request, { params }: Ctx) {
  const post = await getPostById(Number((await params).id)).catch(() => null);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (post.status !== "published") {
    return NextResponse.json({ error: "Publish the post before tweeting it" }, { status: 400 });
  }

  const { text } = await req.json().catch(() => ({}));
  if (typeof text !== "string" || !text.trim()) {
    return NextResponse.json({ error: "The tweet is empty" }, { status: 400 });
  }

  try {
    const tweet = await postTweet(text.trim(), { postId: post.id });
    const saved = await markPostTweeted(post.id, tweet.url);
    return NextResponse.json({ ...(saved ?? post), url: postUrl(saved ?? post) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't post to X" }, { status: 502 });
  }
}

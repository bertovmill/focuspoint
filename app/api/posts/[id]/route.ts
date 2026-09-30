import { NextResponse } from "next/server";
import { getPost, getPostById, postUrl, setPostStatus, slugify, updatePost } from "@/lib/posts";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const post = await getPostById(Number((await params).id)).catch(() => null);
  if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ...post, url: postUrl(post) });
}

/**
 * PATCH any of { title, summary, body, tags, coverUrl, coverAlt, slug, status }.
 * Only the fields sent change. POST is an alias so the editor can flush with
 * sendBeacon on the way out.
 */
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const current = await getPostById(Number((await params).id));
    if (!current) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const b = await req.json();

    let slug: string | undefined;
    if (typeof b.slug === "string" && slugify(b.slug) && slugify(b.slug) !== current.slug) {
      slug = slugify(b.slug);
      if (await getPost(slug)) return NextResponse.json({ error: "That URL is already taken" }, { status: 409 });
    }

    let post = await updatePost(current.slug, {
      slug,
      title: typeof b.title === "string" ? b.title : undefined,
      summary: typeof b.summary === "string" ? b.summary : undefined,
      body: typeof b.body === "string" ? b.body : undefined,
      tags: Array.isArray(b.tags) ? b.tags.map(String).filter(Boolean) : undefined,
      coverUrl: b.coverUrl === null || typeof b.coverUrl === "string" ? b.coverUrl || null : undefined,
      coverAlt: typeof b.coverAlt === "string" ? b.coverAlt : undefined,
    });
    if (post && (b.status === "published" || b.status === "draft") && b.status !== post.status) {
      post = await setPostStatus(post.slug, b.status);
    }
    if (!post) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ...post, url: postUrl(post) });
  } catch {
    return NextResponse.json({ error: "Couldn't save the post" }, { status: 500 });
  }
}

export const POST = PATCH;

import { NextResponse } from "next/server";
import { createPost, getPost, listAllPosts, postUrl, slugify } from "@/lib/posts";

// The Writing section in Cael (app/_components/writing-panel.tsx): every article
// for bertomill.com/writing, drafts included. Cael's own tools (save_post etc.)
// write the same rows.
export async function GET() {
  try {
    const posts = await listAllPosts();
    return NextResponse.json(posts.map(({ body: _body, ...p }) => ({ ...p, url: postUrl(p) })));
  } catch {
    return NextResponse.json([]);
  }
}

// POST { title } — a new, empty draft.
export async function POST(req: Request) {
  try {
    const { title } = await req.json();
    const clean = typeof title === "string" && title.trim() ? title.trim() : "Untitled";
    const base = slugify(clean) || `post-${Date.now()}`;
    let slug = base;
    for (let n = 2; await getPost(slug); n++) slug = `${base}-${n}`;
    const post = await createPost(slug, { title: clean });
    return NextResponse.json({ ...post, url: postUrl(post) });
  } catch {
    return NextResponse.json({ error: "Couldn't create the post" }, { status: 500 });
  }
}

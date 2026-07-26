import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

const KINDS = ["statement", "goal", "image", "method", "milestone"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const kind = searchParams.get("kind");
    const limit = Math.min(Number(searchParams.get("limit") ?? 200), 500);
    const sql = getDb();
    const rows = kind
      ? await sql`
          SELECT id, kind, title, content, image_url, horizon, achieved, achieved_at, created_at
          FROM vision_items
          WHERE kind = ${kind}
          ORDER BY created_at DESC
          LIMIT ${limit}
        `
      : await sql`
          SELECT id, kind, title, content, image_url, horizon, achieved, achieved_at, created_at
          FROM vision_items
          ORDER BY created_at DESC
          LIMIT ${limit}
        `;
    return NextResponse.json(rows);
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request) {
  try {
    const { kind, title, content, image_url, horizon } = await req.json();
    if (!KINDS.includes(kind)) return NextResponse.json({ error: "kind must be statement, goal, image, method, or milestone" }, { status: 400 });
    if (kind === "statement" && !content?.trim()) return NextResponse.json({ error: "content required for a statement" }, { status: 400 });
    if (kind === "goal" && !title?.trim()) return NextResponse.json({ error: "title required for a goal" }, { status: 400 });
    if (kind === "image" && !image_url?.trim()) return NextResponse.json({ error: "image_url required for an image" }, { status: 400 });
    if (kind === "method" && (!title?.trim() || !content?.trim()))
      return NextResponse.json({ error: "a method needs a title (the form of wealth) and content" }, { status: 400 });
    if (kind === "milestone" && (!title?.trim() || !content?.trim()))
      return NextResponse.json({ error: "a milestone needs a title (the year, e.g. '2027') and content" }, { status: 400 });
    const sql = getDb();
    const [row] = await sql`
      INSERT INTO vision_items (kind, title, content, image_url, horizon)
      VALUES (${kind}, ${title?.trim() || null}, ${content?.trim() || null}, ${image_url?.trim() || null}, ${horizon ?? null})
      RETURNING id, kind, title, content, image_url, horizon, achieved, achieved_at, created_at
    `;
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Failed to create vision item" }, { status: 500 });
  }
}

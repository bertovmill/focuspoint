import { NextResponse } from "next/server";
import { deleteHomeSection, getHomeSection, moveHomeSection, updateHomeSection } from "@/lib/home-sections";

type Ctx = { params: Promise<{ id: string }> };

// GET → { content, updated_at, … }: the shape MarkdownDoc loads.
export async function GET(_req: Request, { params }: Ctx) {
  try {
    const section = await getHomeSection(Number((await params).id));
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(section);
  } catch {
    return NextResponse.json({ error: "Couldn't load section" }, { status: 500 });
  }
}

// PUT { content } — the whole body, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request, { params }: Ctx) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    const section = await updateHomeSection(Number((await params).id), { content });
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(section);
  } catch {
    return NextResponse.json({ error: "Couldn't save section" }, { status: 500 });
  }
}

export const POST = PUT;

// PATCH { title } renames; PATCH { move: "up" | "down" } reorders and returns the full list.
export async function PATCH(req: Request, { params }: Ctx) {
  try {
    const id = Number((await params).id);
    const { title, move } = await req.json();
    if (move === "up" || move === "down") return NextResponse.json(await moveHomeSection(id, move));
    if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
    const section = await updateHomeSection(id, { title: title.trim() });
    if (!section) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(section);
  } catch {
    return NextResponse.json({ error: "Couldn't update section" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await deleteHomeSection(Number((await params).id));
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete section" }, { status: 500 });
  }
}

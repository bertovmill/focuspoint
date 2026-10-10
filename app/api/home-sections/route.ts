import { NextResponse } from "next/server";
import { createHomeSection, listHomeSections } from "@/lib/home-sections";

export async function GET() {
  try {
    return NextResponse.json(await listHomeSections());
  } catch {
    return NextResponse.json({ error: "Couldn't load sections" }, { status: 500 });
  }
}

// POST { title, content? } — adds a section at the bottom of the list.
export async function POST(req: Request) {
  try {
    const { title, content } = await req.json();
    if (typeof title !== "string" || !title.trim()) return NextResponse.json({ error: "title is required" }, { status: 400 });
    return NextResponse.json(await createHomeSection(title.trim(), typeof content === "string" ? content : ""));
  } catch {
    return NextResponse.json({ error: "Couldn't add section" }, { status: 500 });
  }
}

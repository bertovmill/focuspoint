import { NextResponse } from "next/server";
import { getPlanDoc, setPlanDoc } from "@/lib/training";

export async function GET() {
  try {
    return NextResponse.json(await getPlanDoc());
  } catch {
    return NextResponse.json({ content: "", updated_at: null });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setPlanDoc(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save the plan" }, { status: 500 });
  }
}

export const POST = PUT;

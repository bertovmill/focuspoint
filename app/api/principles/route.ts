import { NextResponse } from "next/server";
import { getPrinciples, setPrinciples } from "@/lib/principles";

export async function GET() {
  try {
    return NextResponse.json(await getPrinciples());
  } catch {
    return NextResponse.json({ error: "Couldn't load principles" }, { status: 500 });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setPrinciples(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save principles" }, { status: 500 });
  }
}

export const POST = PUT;

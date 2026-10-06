import { NextResponse } from "next/server";
import { getCareerPrinciples, setCareerPrinciples } from "@/lib/career-principles";

export async function GET() {
  try {
    return NextResponse.json(await getCareerPrinciples());
  } catch {
    return NextResponse.json({ error: "Couldn't load career principles" }, { status: 500 });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setCareerPrinciples(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save career principles" }, { status: 500 });
  }
}

export const POST = PUT;

import { NextResponse } from "next/server";
import { getPersonaDraft, setPersonaDraft } from "@/lib/persona";

export async function GET() {
  try {
    return NextResponse.json(await getPersonaDraft());
  } catch {
    return NextResponse.json({ error: "Couldn't load the persona draft" }, { status: 500 });
  }
}

// PUT { content } — the whole draft, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setPersonaDraft(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save the persona draft" }, { status: 500 });
  }
}

export const POST = PUT;

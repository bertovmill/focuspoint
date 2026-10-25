import { NextResponse } from "next/server";
import { getTasteProfile, setTasteProfile } from "@/lib/meal-feedback";

export async function GET() {
  try {
    return NextResponse.json(await getTasteProfile());
  } catch {
    return NextResponse.json({ error: "Couldn't load the taste profile" }, { status: 500 });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setTasteProfile(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save the taste profile" }, { status: 500 });
  }
}

export const POST = PUT;

import { NextResponse } from "next/server";
import { getMealFoundation, setMealFoundation } from "@/lib/meal-foundation";

export async function GET() {
  try {
    return NextResponse.json(await getMealFoundation());
  } catch {
    return NextResponse.json({ error: "Couldn't load the vision, values and process" }, { status: 500 });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setMealFoundation(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save the vision, values and process" }, { status: 500 });
  }
}

export const POST = PUT;

import { NextResponse } from "next/server";
import { getCareerDailyActions, setCareerDailyActions } from "@/lib/career-daily-actions";

export async function GET() {
  try {
    return NextResponse.json(await getCareerDailyActions());
  } catch {
    return NextResponse.json({ error: "Couldn't load career daily actions" }, { status: 500 });
  }
}

// PUT { content } — the whole document, markdown. POST is a PUT alias for sendBeacon.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    return NextResponse.json(await setCareerDailyActions(content));
  } catch {
    return NextResponse.json({ error: "Couldn't save career daily actions" }, { status: 500 });
  }
}

export const POST = PUT;

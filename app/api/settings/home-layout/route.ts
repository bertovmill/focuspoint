import { NextResponse } from "next/server";
import { cleanLayout, getHomeLayout, setHomeLayout } from "@/lib/home-layout";

// Where the blocks sit on Home. GET returns null until he's moved something.

export async function GET() {
  return NextResponse.json({ layout: await getHomeLayout() });
}

export async function PUT(req: Request) {
  try {
    const { layout } = await req.json();
    await setHomeLayout(layout === null ? null : cleanLayout(layout));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Failed to save the layout" }, { status: 500 });
  }
}

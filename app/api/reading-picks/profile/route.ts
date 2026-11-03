import { NextResponse } from "next/server";
import { setInterestProfile } from "@/lib/reading-picks";

// PUT { content } — his own edits to the interest profile; kept word for word on rewrites.
export async function PUT(req: Request) {
  try {
    const { content } = await req.json();
    if (typeof content !== "string") return NextResponse.json({ error: "content required" }, { status: 400 });
    const doc = await setInterestProfile(content);
    return NextResponse.json({ profile: doc.content });
  } catch {
    return NextResponse.json({ error: "Couldn't save the profile" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { cancelScheduledTweet } from "@/lib/tweets";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — cancel a queued tweet, or dismiss a failed one. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const ok = await cancelScheduledTweet(Number((await params).id)).catch(() => false);
  if (!ok) return NextResponse.json({ error: "Not found, or already posted" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

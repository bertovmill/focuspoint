import { NextResponse } from "next/server";
import { deleteTweetDraft } from "@/lib/tweets";

type Ctx = { params: Promise<{ id: string }> };

/** DELETE — discard a tweet draft (also called after the draft is posted). */
export async function DELETE(_req: Request, { params }: Ctx) {
  try {
    await deleteTweetDraft(Number((await params).id));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't delete the draft" }, { status: 500 });
  }
}

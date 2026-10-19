import { NextResponse } from "next/server";
import { listTweetDrafts, saveTweetDraft } from "@/lib/tweets";

/** GET — saved tweet drafts, most recently edited first. */
export async function GET() {
  try {
    return NextResponse.json(await listTweetDrafts());
  } catch {
    return NextResponse.json({ error: "Couldn't load drafts" }, { status: 500 });
  }
}

/** POST `{ text, id? }` — save a new draft, or update draft `id`. */
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const id = Number.isInteger(body.id) ? (body.id as number) : undefined;
  if (!text) return NextResponse.json({ error: "The draft is empty" }, { status: 400 });
  try {
    const draft = await saveTweetDraft(text, id);
    if (!draft) return NextResponse.json({ error: "Draft not found" }, { status: 404 });
    return NextResponse.json(draft);
  } catch {
    return NextResponse.json({ error: "Couldn't save the draft" }, { status: 500 });
  }
}

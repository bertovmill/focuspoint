import { NextResponse } from "next/server";
import { countPersonaNotes, getApprovedPersona, getPersonaDraft, unpublishPersona } from "@/lib/persona";

// GET — where the persona stands: the live (approved) text, when the draft last
// changed, and how many notes are tagged to feed it.
export async function GET() {
  try {
    const [approved, draft, noteCount] = await Promise.all([getApprovedPersona(), getPersonaDraft(), countPersonaNotes()]);
    return NextResponse.json({
      approved,
      draftUpdatedAt: draft.updated_at,
      draftMatchesLive: draft.content.trim() === approved.content.trim(),
      noteCount,
    });
  } catch {
    return NextResponse.json({ error: "Couldn't load the persona" }, { status: 500 });
  }
}

// DELETE — take the persona off the public chat.
export async function DELETE() {
  try {
    return NextResponse.json({ approved: await unpublishPersona() });
  } catch {
    return NextResponse.json({ error: "Couldn't unpublish the persona" }, { status: 500 });
  }
}

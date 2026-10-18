import { NextResponse } from "next/server";
import { addTaskUpdate, listTaskUpdates, normalizeAuthor } from "@/lib/task-updates";

// The update thread on one task. The board only ever shows the newest line, so
// this is where the rest of the history lives — and where the UI posts Berto's
// own updates. Agents write theirs through the MCP server instead.

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    return NextResponse.json(await listTaskUpdates(id));
  } catch {
    return NextResponse.json([], { status: 200 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const { body, author } = await req.json();
    const result = await addTaskUpdate(id, body, normalizeAuthor(author));
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json(result.update);
  } catch {
    return NextResponse.json({ error: "Failed to post update" }, { status: 500 });
  }
}

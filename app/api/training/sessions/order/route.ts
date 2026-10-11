import { NextResponse } from "next/server";
import { reorderSessions } from "@/lib/training";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// PUT { date, ids } — a day's sessions in their new order, top to bottom. An id from
// another day lands on this one at that spot, so dragging a card up or down within a
// day and dragging one in from another day are the same write. Returns the day.
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const date = String(body?.date ?? "");
    const ids: number[] = Array.isArray(body?.ids) ? Array.from(new Set(body.ids.map(Number))) : [];
    if (!ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (ids.length === 0 || ids.some((n) => !Number.isInteger(n) || n <= 0)) return NextResponse.json({ error: "Bad ids" }, { status: 400 });
    return NextResponse.json({ sessions: await reorderSessions(date, ids) });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reorder" }, { status: 400 });
  }
}

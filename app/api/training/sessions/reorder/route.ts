import { NextResponse } from "next/server";
import { reorderDay } from "@/lib/training";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST { session_date, ids: [id, …] } — the day's sessions in their new order.
// Any id from another day moves onto this one.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const ids = Array.isArray(body?.ids) ? body.ids.map(Number) : [];
    if (!ISO.test(String(body?.session_date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (ids.length === 0 || !ids.every((n: number) => Number.isInteger(n) && n > 0)) return NextResponse.json({ error: "Bad ids" }, { status: 400 });
    await reorderDay(body.session_date, ids);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't reorder" }, { status: 400 });
  }
}

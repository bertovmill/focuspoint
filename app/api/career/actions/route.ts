import { NextResponse } from "next/server";
import { getCareerActions, isISODate, setTick } from "@/lib/career-plan";

// POST { day, key, done, note? } — tick or untick one daily action on one day.
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!isISODate(body?.day) || typeof body?.key !== "string" || typeof body?.done !== "boolean") {
      return NextResponse.json({ error: "day, key and done required" }, { status: 400 });
    }
    const action = (await getCareerActions()).find((a) => a.key === body.key);
    if (!action) return NextResponse.json({ error: "No such daily action" }, { status: 404 });
    await setTick(body.day, action, body.done, typeof body.note === "string" || body.note === null ? body.note : undefined);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Couldn't save that" }, { status: 500 });
  }
}

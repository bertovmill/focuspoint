import { NextResponse } from "next/server";
import { draftWeek } from "@/lib/training";

export const maxDuration = 120;

// POST { week_start, sessions_per_week? } — Cael writes the week (undone sessions replaced)
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body?.week_start))) return NextResponse.json({ error: "Bad week_start" }, { status: 400 });
    const per = Math.min(Math.max(Number(body?.sessions_per_week) || 6, 3), 7);
    return NextResponse.json(await draftWeek(body.week_start, per));
  } catch (err) {
    console.error("[api/training/draft]", err);
    return NextResponse.json({ error: "Couldn't draft the week", detail: String(err) }, { status: 500 });
  }
}

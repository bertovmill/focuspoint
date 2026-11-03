import { NextResponse } from "next/server";
import { getInterestProfile, listReadingPicks, pickTonightsRead } from "@/lib/reading-picks";

export const maxDuration = 120;

// GET → { picks, profile } for /writing?tab=reading
export async function GET() {
  try {
    const [picks, profile] = await Promise.all([listReadingPicks(), getInterestProfile()]);
    return NextResponse.json({ picks, profile: profile.content });
  } catch {
    return NextResponse.json({ error: "Couldn't load reading picks" }, { status: 500 });
  }
}

// POST { force?: boolean } → tonight's pick now (force swaps today's for another)
export async function POST(req: Request) {
  try {
    const { force } = await req.json().catch(() => ({}));
    const pick = await pickTonightsRead({ force: Boolean(force) });
    return NextResponse.json({ pick });
  } catch (err) {
    console.error("reading pick failed:", err);
    return NextResponse.json({ error: "Couldn't pick a read" }, { status: 500 });
  }
}

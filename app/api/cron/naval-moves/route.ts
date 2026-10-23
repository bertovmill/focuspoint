import { NextResponse } from "next/server";
import { addTodaysNavalMoves, principleOfTheDay } from "@/lib/naval";
import { sendPush } from "@/lib/push";

// Weekday mornings (vercel.json cron): puts the three Naval moves on the board and
// sends a push with the principle of the day, so the lesson shows up as a task and
// a pop-up rather than waiting to be remembered. See lib/naval.ts.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const { added, date } = await addTodaysNavalMoves();
    if (added.length === 0) return NextResponse.json({ date, added });
    const principle = principleOfTheDay(date);
    await sendPush({
      title: `Naval: ${principle.title}`,
      body: "Today's 3 moves are on your board: leverage, specific knowledge, long game.",
      url: "/great-thinkers/naval",
      tag: "naval-moves",
    }).catch((err) => console.error("naval push failed:", err));
    return NextResponse.json({ date, added });
  } catch (err) {
    console.error("naval moves failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getPrinciples } from "@/lib/principles";
import { DEFAULT_HABITS_MARKDOWN, parseDailyHabits } from "@/lib/day-plan";
import { sendPush } from "@/lib/push";

// A nudge every other day listing the daily habits (vercel.json cron, ~noon
// Toronto). Berto's call (2026-10-04): he won't tick the habits every day — what
// matters is being reminded every couple of days, so this sends regardless of
// what's been ticked. Nothing to log, nothing scored.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const doc = await getPrinciples();
    const habits = parseDailyHabits(doc.content) ?? parseDailyHabits(DEFAULT_HABITS_MARKDOWN)!;
    if (habits.length === 0) return NextResponse.json({ sent: false, reason: "no habits" });

    await sendPush({
      title: "Your daily habits",
      body: habits.map((h) => h.name).join(" · "),
      url: "/#today-plan",
      tag: "habit-nudge",
    });
    return NextResponse.json({ sent: true, habits: habits.map((h) => h.name) });
  } catch (err) {
    console.error("habit nudge failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { pickTonightsRead } from "@/lib/reading-picks";
import { sendPush } from "@/lib/push";

// 7pm Toronto (vercel.json cron, 00:00 UTC = 7pm EST, 8pm in summer): tonight's
// one read goes on the board and a push says what it is. See lib/reading-picks.ts.

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const pick = await pickTonightsRead();
    await sendPush({
      title: `Tonight: ${pick.title}`,
      body: pick.why,
      url: "/writing?tab=reading",
      tag: "reading-pick",
    }).catch((err) => console.error("reading pick push failed:", err));
    return NextResponse.json({ pick });
  } catch (err) {
    console.error("reading pick failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

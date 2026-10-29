import { NextResponse } from "next/server";
import { refreshTweetStats } from "@/lib/x-api";

// Daily (vercel.json cron): reads X stats for tweets that just turned 2 or 7 days
// old, then never again — see STATS_FIRST_DAYS / STATS_FINAL_DAYS in lib/x-shared.ts.

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    return NextResponse.json(await refreshTweetStats("due"));
  } catch (err) {
    console.error("tweet stats cron failed:", err);
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

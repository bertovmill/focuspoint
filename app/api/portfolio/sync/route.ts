import { NextResponse } from "next/server";
import { syncPortfolio } from "@/lib/portfolio-sync";
import { fetchPortfolioValue, isPortfolioConnected } from "@/lib/snaptrade";

export const dynamic = "force-dynamic";

/**
 * Whether a brokerage is connected, and — with `?debug=1` — the full breakdown of
 * which accounts were counted and which were skipped and why. A portfolio total you
 * can't explain is a portfolio total you don't trust.
 */
export async function GET(req: Request) {
  try {
    if (new URL(req.url).searchParams.get("debug")) {
      return NextResponse.json(await fetchPortfolioValue());
    }
    return NextResponse.json({ connected: await isPortfolioConnected() });
  } catch (err) {
    return NextResponse.json({ connected: false, error: String(err) });
  }
}

/** Read the balance now and record it against today. */
export async function POST() {
  try {
    return NextResponse.json(await syncPortfolio());
  } catch (err) {
    console.error("Portfolio sync failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { syncPortfolio } from "@/lib/portfolio-sync";
import { isWealthsimpleConnected } from "@/lib/wealthsimple";

export const dynamic = "force-dynamic";

/** Whether a Wealthsimple session is stored. */
export async function GET() {
  try {
    return NextResponse.json({ connected: await isWealthsimpleConnected() });
  } catch {
    return NextResponse.json({ connected: false });
  }
}

/**
 * Read the balance now and record it against today.
 *
 * There is no connect route on purpose — connecting needs a password, and that only
 * ever happens locally via scripts/wealthsimple-login.mjs.
 */
export async function POST() {
  try {
    return NextResponse.json(await syncPortfolio());
  } catch (err) {
    console.error("Wealthsimple sync failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

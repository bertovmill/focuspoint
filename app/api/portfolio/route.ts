import { NextResponse } from "next/server";
import { getPortfolio } from "@/lib/portfolio";

/** Every capability and project, drafts included, for the Career tab's editor. */
export async function GET() {
  try {
    return NextResponse.json(await getPortfolio());
  } catch {
    return NextResponse.json({ error: "Couldn't load the portfolio" }, { status: 500 });
  }
}

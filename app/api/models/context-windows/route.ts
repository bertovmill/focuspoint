import { NextResponse } from "next/server";

import { getContextWindows } from "@/lib/gateway-catalog";

// Model id → context window (tokens), for the traces view's "peak context"
// gauge. Same numbers eve compacts against.
export async function GET() {
  const windows = await getContextWindows();
  return NextResponse.json({ windows: Object.fromEntries(windows) });
}

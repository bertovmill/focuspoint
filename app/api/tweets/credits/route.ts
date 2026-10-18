import { NextResponse } from "next/server";
import { getXCreditBalance } from "@/lib/x-api";

/** GET — X pay-per-use credit left, in USD (`balance` is null when unavailable). */
export async function GET() {
  const balance = await getXCreditBalance().catch(() => null);
  return NextResponse.json({ balance });
}

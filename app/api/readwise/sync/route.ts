import { NextResponse } from "next/server";
import { syncReadwise } from "@/lib/readwise-sync";
import { checkReadwiseToken, isReadwiseConfigured } from "@/lib/readwise";

export const dynamic = "force-dynamic";

/** Whether a token is set, and whether Readwise actually accepts it. */
export async function GET() {
  return NextResponse.json({
    configured: isReadwiseConfigured(),
    valid: await checkReadwiseToken(),
  });
}

export async function POST(req: Request) {
  try {
    const days = await req
      .json()
      .then((b: { days?: number }) => Math.min(Math.max(Number(b?.days) || 14, 1), 90))
      .catch(() => 14);
    return NextResponse.json(await syncReadwise(days));
  } catch (err) {
    console.error("Readwise sync failed:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

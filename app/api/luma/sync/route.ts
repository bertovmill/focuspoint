import { NextResponse } from "next/server";
import { lastLumaSync, syncLuma } from "@/lib/luma-sync";

// A full pull is ~20 events × (detail + guest pages) plus the people list — well
// over the default budget on a cold run.
export const maxDuration = 300;

/** When the mirror was last refreshed, and how much it holds. */
export async function GET() {
  try {
    return NextResponse.json({ last: await lastLumaSync() });
  } catch {
    return NextResponse.json({ last: null });
  }
}

/** Refresh the mirror now. Safe to call repeatedly — every write is an upsert. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, ...(await syncLuma()) });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 300) }, { status: 500 });
  }
}

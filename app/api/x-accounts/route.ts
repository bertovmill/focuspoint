import { NextResponse } from "next/server";
import { listXAccounts } from "@/lib/x-accounts";

/** GET — the X accounts Cael can post as, Berto's own first. */
export async function GET() {
  try {
    return NextResponse.json(await listXAccounts());
  } catch (err) {
    console.error("[x accounts] list failed:", err);
    return NextResponse.json({ error: "Couldn't load X accounts" }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { approvePersonaDraft } from "@/lib/persona";

// POST — publish the current draft to the public chat on bertomill.com.
export async function POST() {
  try {
    return NextResponse.json({ approved: await approvePersonaDraft() });
  } catch {
    return NextResponse.json({ error: "Couldn't approve the persona" }, { status: 500 });
  }
}

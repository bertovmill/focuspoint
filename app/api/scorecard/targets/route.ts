import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getTargets, setTargets } from "@/lib/scorecard";

// The bars the scorecard measures against. Tunable so raising the steps target
// from 20k doesn't need a deploy.

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(await getTargets(getDb()));
  } catch {
    return NextResponse.json({ error: "Failed to load targets" }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    return NextResponse.json(await setTargets(getDb(), await req.json()));
  } catch {
    return NextResponse.json({ error: "Failed to save targets" }, { status: 500 });
  }
}

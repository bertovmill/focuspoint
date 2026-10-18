import { NextResponse } from "next/server";
import { addCheckpoint, getCheckpoints, isISODate } from "@/lib/career-plan";

export async function GET() {
  try {
    return NextResponse.json(await getCheckpoints());
  } catch {
    return NextResponse.json([]);
  }
}

// POST { name, due_date, notes? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name || !isISODate(body?.due_date)) return NextResponse.json({ error: "name and due_date required" }, { status: 400 });
    return NextResponse.json(await addCheckpoint({ name, due_date: body.due_date, notes: body.notes ?? null }));
  } catch {
    return NextResponse.json({ error: "Couldn't save the checkpoint" }, { status: 500 });
  }
}

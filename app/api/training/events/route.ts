import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { getEvents, shapeEvent } from "@/lib/training";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function GET() {
  try {
    return NextResponse.json(await getEvents());
  } catch {
    return NextResponse.json([]);
  }
}

// POST { name, event_date, kind?, notes? }
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const name = String(body?.name ?? "").trim();
    if (!name || !ISO.test(String(body?.event_date))) return NextResponse.json({ error: "name and event_date required" }, { status: 400 });
    const [row] = await getDb()`
      INSERT INTO training_events (name, event_date, kind, notes)
      VALUES (${name}, ${body.event_date}, ${body.kind || "hyrox"}, ${body.notes?.trim?.() || null})
      RETURNING id, name, to_char(event_date, 'YYYY-MM-DD') AS event_date, kind, notes
    `;
    return NextResponse.json(shapeEvent(row as Record<string, unknown>));
  } catch {
    return NextResponse.json({ error: "Couldn't save the race" }, { status: 500 });
  }
}

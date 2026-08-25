import { NextResponse } from "next/server";
import { completeTask } from "@/lib/tasks";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    // "Done & repeat" — cross the task off *and* line the same work up for tomorrow.
    // The plain check-off sends no body at all, so an unparseable body just means "no".
    const body = await req.json().catch(() => ({}));
    const result = await completeTask(id, { repeat: Boolean(body?.repeat) });
    if (!result.ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return result.recurring
      ? NextResponse.json({
          success: true,
          recurring: true,
          next_due: result.next_due,
          calendar_event_id: result.calendar_event_id,
        })
      : NextResponse.json({
          success: true,
          recurring: false,
          repeated: result.repeated,
          calendar_event_id: result.calendar_event_id,
        });
  } catch {
    return NextResponse.json({ error: "Failed" }, { status: 500 });
  }
}

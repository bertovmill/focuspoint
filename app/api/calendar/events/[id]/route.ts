import { type NextRequest, NextResponse } from "next/server";
import { gcalFetch, GoogleNotConnectedError } from "@/lib/google";

function handleError(err: unknown) {
  if (err instanceof GoogleNotConnectedError) {
    return NextResponse.json({ error: "not_connected" }, { status: 409 });
  }
  console.error("Calendar API error:", err);
  return NextResponse.json({ error: "calendar_error" }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const body = await request.json();
    const patch: Record<string, unknown> = {};
    if (body.title !== undefined) patch.summary = body.title;
    if (body.description !== undefined) patch.description = body.description;
    if (body.location !== undefined) patch.location = body.location;
    if (body.start && body.end) {
      // Clear the unused variant explicitly — Google keeps stale fields otherwise
      if (body.allDay) {
        patch.start = { date: body.start.slice(0, 10), dateTime: null };
        patch.end = { date: body.end.slice(0, 10), dateTime: null };
      } else {
        patch.start = { dateTime: body.start, date: null };
        patch.end = { dateTime: body.end, date: null };
      }
    }
    const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(id)}`, {
      method: "PATCH",
      body: JSON.stringify(patch),
    });
    if (!res.ok) throw new Error(`Google update event failed: ${res.status} ${await res.text()}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const res = await gcalFetch(`/calendars/primary/events/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    // 410 = already gone — treat as success
    if (!res.ok && res.status !== 410) {
      throw new Error(`Google delete event failed: ${res.status} ${await res.text()}`);
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleError(err);
  }
}

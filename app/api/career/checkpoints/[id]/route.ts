import { NextResponse } from "next/server";
import { deleteCheckpoint, isISODate, updateCheckpoint } from "@/lib/career-plan";
import { todayISO } from "@/lib/nutrition";

type Params = { params: Promise<{ id: string }> };

// PATCH { name?, due_date?, notes?, done?, today? }
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (body.due_date !== undefined && !isISODate(body.due_date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    const row = await updateCheckpoint(
      Number(id),
      { name: body.name, due_date: body.due_date, notes: body.notes, done: typeof body.done === "boolean" ? body.done : undefined },
      isISODate(body.today) ? body.today : todayISO(),
    );
    if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(row);
  } catch {
    return NextResponse.json({ error: "Couldn't update the checkpoint" }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await deleteCheckpoint(Number(id));
  return NextResponse.json({ ok: true });
}

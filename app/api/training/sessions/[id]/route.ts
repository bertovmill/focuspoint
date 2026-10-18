import { NextResponse } from "next/server";
import { deleteSession, getSessions, saveSession, setActuals, setSessionDone } from "@/lib/training";
import { getDb } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

// PATCH { done, actual_km?, actual_pace_sec?, actual_minutes? } toggles completion;
// PATCH { actuals: { km, pace_sec } } sets what he actually ran (typed in);
// PATCH { session_date?, type?, title?, target_km?, target_minutes?, target_pace_sec?, intensity?, notes? } edits.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { id } = await params;
    const body = await req.json();
    if (typeof body?.done === "boolean") {
      const row = await setSessionDone(Number(id), body.done, {
        km: body.actual_km == null || body.actual_km === "" ? null : Number(body.actual_km),
        minutes: body.actual_minutes == null || body.actual_minutes === "" ? null : Math.round(Number(body.actual_minutes)),
        pace_sec: body.actual_pace_sec == null || body.actual_pace_sec === "" ? null : Number(body.actual_pace_sec),
      });
      return NextResponse.json(row);
    }
    if (body?.actuals && typeof body.actuals === "object") {
      const n = (v: unknown) => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
      return NextResponse.json(await setActuals(Number(id), n(body.actuals.km), n(body.actuals.pace_sec)));
    }
    const [cur] = await getDb()`SELECT to_char(session_date, 'YYYY-MM-DD') AS d, type, title, target_km, target_minutes, target_pace_sec, intensity, notes FROM training_sessions WHERE id = ${id}`;
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const row = await saveSession({
      id: Number(id),
      session_date: body.session_date ?? cur.d,
      type: body.type ?? cur.type,
      title: body.title ?? cur.title,
      target_km: body.target_km !== undefined ? (body.target_km === "" || body.target_km === null ? null : Number(body.target_km)) : cur.target_km,
      target_minutes:
        body.target_minutes !== undefined ? (body.target_minutes === "" || body.target_minutes === null ? null : Math.round(Number(body.target_minutes))) : cur.target_minutes,
      target_pace_sec:
        body.target_pace_sec !== undefined ? (body.target_pace_sec === "" || body.target_pace_sec === null ? null : Number(body.target_pace_sec)) : cur.target_pace_sec,
      intensity: body.intensity !== undefined ? body.intensity : cur.intensity,
      notes: body.notes !== undefined ? (typeof body.notes === "string" && body.notes.trim() ? body.notes.trim() : null) : cur.notes,
      workout_slug: body.workout_slug === undefined ? undefined : body.workout_slug || null,
    });
    return NextResponse.json(row);
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't update" }, { status: 400 });
  }
}

export async function DELETE(_req: Request, { params }: Params) {
  const { id } = await params;
  await deleteSession(Number(id));
  return NextResponse.json({ ok: true });
}

export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const rows = await getSessions("1970-01-01", "2999-12-31");
  const row = rows.find((r) => r.id === Number(id));
  return row ? NextResponse.json(row) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

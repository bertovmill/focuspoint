import { NextResponse } from "next/server";
import { getWorkoutDay, saveWorkoutCheck, saveWorkoutDay, type StrengthEntry } from "@/lib/strength";
import { todayISO } from "@/lib/nutrition";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
type Params = { params: Promise<{ template: string }> };

// GET ?date= → { date, logs, prescriptions, history } for one session of a template
export async function GET(req: Request, { params }: Params) {
  try {
    const { template } = await params;
    const date = new URL(req.url).searchParams.get("date") ?? todayISO();
    if (!ISO.test(date)) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    return NextResponse.json(await getWorkoutDay(template, date));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't load" }, { status: 400 });
  }
}

// PUT { date, entries: [{ exercise, weight, amount?, target_reps, reps: (number|null)[] }] }
export async function PUT(req: Request, { params }: Params) {
  try {
    const { template } = await params;
    const body = await req.json();
    if (!ISO.test(String(body?.date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    const entries: StrengthEntry[] = (Array.isArray(body.entries) ? body.entries : []).map((e: Record<string, unknown>) => ({
      exercise: String(e.exercise),
      weight: e.weight === null || e.weight === "" || e.weight === undefined ? null : Number(e.weight),
      amount: e.amount === null || e.amount === "" || e.amount === undefined ? null : Number(e.amount),
      target_reps: Number(e.target_reps),
      reps: (Array.isArray(e.reps) ? e.reps : []).map((r: unknown) => (r === null || r === "" ? null : Number(r))),
    }));
    return NextResponse.json(await saveWorkoutDay(template, body.date, entries));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}

// PATCH { date, part: "warmup" | "cooldown", done: boolean[] } — tick the warm-up / cool-down parts.
export async function PATCH(req: Request, { params }: Params) {
  try {
    const { template } = await params;
    const body = await req.json();
    if (!ISO.test(String(body?.date))) return NextResponse.json({ error: "Bad date" }, { status: 400 });
    if (body.part !== "warmup" && body.part !== "cooldown") return NextResponse.json({ error: "Bad part" }, { status: 400 });
    const done = (Array.isArray(body.done) ? body.done : []).slice(0, 20).map(Boolean);
    return NextResponse.json(await saveWorkoutCheck(template, body.date, body.part, done));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}

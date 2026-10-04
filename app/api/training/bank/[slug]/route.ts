import { NextResponse } from "next/server";
import { archiveWorkout, getWorkout, saveWorkout } from "@/lib/workout-bank";

type Params = { params: Promise<{ slug: string }> };

export async function GET(_req: Request, { params }: Params) {
  const { slug } = await params;
  const w = await getWorkout(slug);
  return w ? NextResponse.json(w) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

// PUT the full definition — replaces it (the slug stays)
export async function PUT(req: Request, { params }: Params) {
  try {
    const { slug } = await params;
    const cur = await getWorkout(slug);
    if (!cur) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(await saveWorkout(await req.json(), cur.slug));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Couldn't save" }, { status: 400 });
  }
}

// DELETE archives: out of the bank and the default week, history kept
export async function DELETE(_req: Request, { params }: Params) {
  const { slug } = await params;
  await archiveWorkout(slug);
  return NextResponse.json({ ok: true });
}

import { NextResponse } from "next/server";
import { MEAL_SLOT_KEYS } from "@/lib/nutrition";
import { fillFromBank } from "@/lib/nutrition-plan";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

// POST { cells: [{ date, slot }] }   fills those cells from the meal bank,
// leaving any that are already planned. Returns { filled, skipped }.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const cells = (Array.isArray(body?.cells) ? body.cells : []).filter(
    (c: { date?: unknown; slot?: unknown }) => ISO.test(String(c?.date)) && MEAL_SLOT_KEYS.includes(String(c?.slot)),
  ) as { date: string; slot: string }[];
  if (cells.length === 0) return NextResponse.json({ error: "No cells to fill" }, { status: 400 });
  if (cells.length > 21) return NextResponse.json({ error: "Too many cells" }, { status: 400 });
  try {
    return NextResponse.json(await fillFromBank(cells));
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

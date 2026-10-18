import { NextResponse } from "next/server";
import { getProteinTarget, proteinEatenOn, setProteinTarget } from "@/lib/nutrition-plan";

function localToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// GET ?date=  → { date, target_g, eaten_g } — the protein ring
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const date = searchParams.get("date") ?? localToday();
    const [target_g, eaten_g] = await Promise.all([getProteinTarget(), proteinEatenOn(date)]);
    return NextResponse.json({ date, target_g, eaten_g });
  } catch {
    return NextResponse.json({ error: "Couldn't read target" }, { status: 500 });
  }
}

// PUT { target_g }
export async function PUT(req: Request) {
  try {
    const { target_g } = await req.json();
    const saved = await setProteinTarget(Number(target_g));
    return NextResponse.json({ target_g: saved });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : "Bad target" }, { status: 400 });
  }
}

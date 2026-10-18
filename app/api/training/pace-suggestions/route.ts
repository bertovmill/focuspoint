import { NextResponse } from "next/server";
import { paceSuggestions } from "@/lib/training";

// GET → { long_run, easy, intervals }: a suggested pace (sec/km) per run type, each with its basis.
export async function GET() {
  try {
    return NextResponse.json(await paceSuggestions());
  } catch {
    return NextResponse.json({ long_run: null, easy: null, intervals: null });
  }
}

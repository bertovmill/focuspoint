import { NextResponse } from "next/server";
import { generatePersonaDraft } from "@/lib/persona";

export const maxDuration = 120;

// POST — re-distill the persona-tagged notes into a new draft. The live version is untouched.
export async function POST() {
  try {
    return NextResponse.json(await generatePersonaDraft());
  } catch (err) {
    const message = err instanceof Error ? err.message : "Couldn't generate the persona";
    console.error("[persona/generate]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

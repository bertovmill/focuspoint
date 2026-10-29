import { NextResponse } from "next/server";
import { workoutImage } from "@/lib/training-art";

// One image-model call plus the upload on a first show; a stored picture comes straight back.
export const maxDuration = 120;

/**
 * POST { type, title, workout_slug?, regenerate? } → { image_url }.
 * The workout's picture for Home (lib/training-art.ts), made the first time it's asked for.
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { type?: string; title?: string; workout_slug?: string | null; regenerate?: boolean };
    if (!body.type || !body.title?.trim()) return NextResponse.json({ error: "type and title are required" }, { status: 400 });
    const image_url = await workoutImage(
      { type: body.type, title: body.title.trim(), workout_slug: body.workout_slug ?? null },
      { regenerate: body.regenerate === true },
    );
    return NextResponse.json({ image_url });
  } catch (err) {
    console.error("[api/training/image]", err);
    return NextResponse.json({ error: "Couldn't make a picture — try again." }, { status: 500 });
  }
}

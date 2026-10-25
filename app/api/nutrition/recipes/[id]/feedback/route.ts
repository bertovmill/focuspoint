import { NextResponse, after } from "next/server";
import { afterRating, getMealRating, rateMeal } from "@/lib/meal-feedback";

// The model calls that follow a rating (taste profile, replacement meal) run after the response.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// GET  → { rating: "up" | "down" | null, reason }
export async function GET(_req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const r = await getMealRating(id);
    return NextResponse.json({ rating: r?.rating ?? null, reason: r?.reason ?? null });
  } catch {
    return NextResponse.json({ error: "Couldn't load the rating" }, { status: 500 });
  }
}

// PUT { rating: "up" | "down" | null, reason?: string } — null takes the rating off.
export async function PUT(req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const { rating, reason } = await req.json();
    if (rating !== "up" && rating !== "down" && rating !== null) {
      return NextResponse.json({ error: "rating must be 'up', 'down', or null" }, { status: 400 });
    }
    const saved = await rateMeal(id, rating, typeof reason === "string" ? reason : null);
    after(() => afterRating(id));
    return NextResponse.json({ rating: saved?.rating ?? null, reason: saved?.reason ?? null });
  } catch {
    return NextResponse.json({ error: "Couldn't save the rating" }, { status: 500 });
  }
}

import { NextResponse, after } from "next/server";
import { afterReadingRating, rateReadingPick } from "@/lib/reading-picks";

// The profile rewrite that follows a rating runs after the response.
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

// PUT { rating?: "up" | "down" | null, feedback?: string } — omitted fields stay as they are.
export async function PUT(req: Request, { params }: Params) {
  const id = Number((await params).id);
  if (!Number.isInteger(id)) return NextResponse.json({ error: "Bad id" }, { status: 400 });
  try {
    const body = await req.json();
    const rating = "rating" in body ? body.rating : undefined;
    if (rating !== undefined && rating !== "up" && rating !== "down" && rating !== null) {
      return NextResponse.json({ error: "rating must be 'up', 'down', or null" }, { status: 400 });
    }
    const feedback = typeof body.feedback === "string" ? body.feedback : undefined;
    const pick = await rateReadingPick(id, rating, feedback);
    if (!pick) return NextResponse.json({ error: "Not found" }, { status: 404 });
    after(() => afterReadingRating());
    return NextResponse.json({ pick });
  } catch {
    return NextResponse.json({ error: "Couldn't save the rating" }, { status: 500 });
  }
}

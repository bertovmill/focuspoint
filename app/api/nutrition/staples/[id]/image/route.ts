import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";
import { generateStapleImage } from "@/lib/nutrition-art";

export const maxDuration = 120;

// Generates the photo for one staple. Called when a staple is added from the UI,
// and by scripts/generate-nutrition-art.mjs for the ones seeded without a photo.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const sql = getDb();
    const [staple] = await sql`SELECT id, name, why FROM nutrition_staples WHERE id = ${id}`;
    if (!staple) return NextResponse.json({ error: "Not found" }, { status: 404 });
    const url = await generateStapleImage(String(staple.name), staple.why as string | null);
    const [row] = await sql`
      UPDATE nutrition_staples SET image_url = ${url} WHERE id = ${id}
      RETURNING id, name, why, image_url, sort_order
    `;
    return NextResponse.json(row);
  } catch (err) {
    console.error("[api/nutrition/staples/image]", err);
    return NextResponse.json({ error: "Couldn't generate the image" }, { status: 500 });
  }
}

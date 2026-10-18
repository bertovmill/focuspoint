import { NextResponse } from "next/server";
import { slugify, upsertCapability } from "@/lib/portfolio";

/**
 * Create or update a capability. Body: { slug?, name, summary?, sortOrder?, newSlug? }.
 * Without a slug one is made from the name.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const slug = typeof b.slug === "string" && b.slug ? b.slug : slugify(String(b.name ?? ""));
    if (!slug) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    const cap = await upsertCapability(slug, {
      name: typeof b.name === "string" ? b.name.trim() : undefined,
      summary: typeof b.summary === "string" ? b.summary.trim() : undefined,
      sortOrder: Number.isInteger(b.sortOrder) ? b.sortOrder : undefined,
      slug: typeof b.newSlug === "string" && slugify(b.newSlug) ? slugify(b.newSlug) : undefined,
    });
    return NextResponse.json(cap);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't save" }, { status: 400 });
  }
}

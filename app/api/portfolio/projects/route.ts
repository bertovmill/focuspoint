import { NextResponse } from "next/server";
import { slugify, upsertProject } from "@/lib/portfolio";

const optionalText = (v: unknown) => (v === null ? null : typeof v === "string" ? v : undefined);

/**
 * Create or update a project. Body: { slug?, name, summary?, year?, liveUrl?,
 * repoUrl?, workSlug?, status?, sortOrder?, newSlug?, capabilities?: [{ slug, evidence }] }.
 * `capabilities`, when sent, replaces the project's links.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const slug = typeof b.slug === "string" && b.slug ? b.slug : slugify(String(b.name ?? ""));
    if (!slug) return NextResponse.json({ error: "A name is required" }, { status: 400 });
    const project = await upsertProject(slug, {
      name: typeof b.name === "string" ? b.name.trim() : undefined,
      summary: typeof b.summary === "string" ? b.summary.trim() : undefined,
      year: optionalText(b.year),
      liveUrl: optionalText(b.liveUrl),
      repoUrl: optionalText(b.repoUrl),
      workSlug: optionalText(b.workSlug),
      status: b.status === "published" || b.status === "draft" ? b.status : undefined,
      sortOrder: Number.isInteger(b.sortOrder) ? b.sortOrder : undefined,
      slug: typeof b.newSlug === "string" && slugify(b.newSlug) ? slugify(b.newSlug) : undefined,
      capabilities: Array.isArray(b.capabilities)
        ? b.capabilities.map((c: { slug: unknown; evidence: unknown }) => ({
            slug: String(c.slug),
            evidence: String(c.evidence ?? ""),
          }))
        : undefined,
    });
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Couldn't save" }, { status: 400 });
  }
}

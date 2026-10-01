import { NextResponse } from "next/server";
import { deleteProject } from "@/lib/portfolio";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const ok = await deleteProject(Number((await params).id)).catch(() => false);
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

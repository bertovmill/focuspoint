import { NextResponse } from "next/server";
import { deleteCapability } from "@/lib/portfolio";

type Ctx = { params: Promise<{ id: string }> };

/** Removes the capability and every project's link to it. */
export async function DELETE(_req: Request, { params }: Ctx) {
  const ok = await deleteCapability(Number((await params).id)).catch(() => false);
  return ok ? NextResponse.json({ ok }) : NextResponse.json({ error: "Not found" }, { status: 404 });
}

import { NextResponse } from "next/server";
import { getDb } from "@/lib/db";

// The freeform half of the Tasks notebook: a single, never-ending Excalidraw scene
// (row id = 1). Task cards are not in here — they're `todos` rows drawn on top.
const CANVAS_ID = 1;

const EMPTY_SCENE = { elements: [], appState: {}, files: {} };

export async function GET() {
  try {
    const sql = getDb();
    const [row] = await sql`SELECT scene, updated_at FROM task_canvas WHERE id = ${CANVAS_ID}`;
    return NextResponse.json({ scene: row?.scene ?? EMPTY_SCENE, updated_at: row?.updated_at ?? null });
  } catch {
    // A missing table or an unreachable DB shouldn't stop the canvas from opening —
    // it just opens blank and the first save creates the row.
    return NextResponse.json({ scene: EMPTY_SCENE, updated_at: null });
  }
}

export async function PUT(req: Request) {
  try {
    const { scene } = await req.json();
    if (!scene || typeof scene !== "object") {
      return NextResponse.json({ error: "scene required" }, { status: 400 });
    }
    const sql = getDb();
    await sql`
      INSERT INTO task_canvas (id, scene, updated_at) VALUES (${CANVAS_ID}, ${JSON.stringify(scene)}, NOW())
      ON CONFLICT (id) DO UPDATE SET scene = EXCLUDED.scene, updated_at = NOW()
    `;
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Failed to save canvas" }, { status: 500 });
  }
}
